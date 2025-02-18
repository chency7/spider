import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

export interface Assets {  // 导出接口以供其他文件使用
    title: string;
    images: string[];
    videos: string[];
}

export interface DownloadResult {
    title: string;
    imagesCount: number;
    videosCount: number;
    downloadPath: string;
}

@Injectable()
export class getAllAssetsByUrl {
    private readonly logger = new Logger(getAllAssetsByUrl.name);
    private assets: Assets = {
        title: '',
        images: [],
        videos: []
    };

    constructor() {
        puppeteer.use(StealthPlugin());
    }

    async crawlXiaohongshu(shareUrl: string): Promise<Assets> {
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials'
            ],
        });

        try {
            const page = await browser.newPage();

            // 设置随机用户代理
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
            ];

            await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
            await page.setViewport({ width: 1920, height: 1080 });

            // 访问页面
            await page.goto(shareUrl, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            // 等待内容加载
            await page.waitForTimeout(5000);

            // 获取标题
            const title = await page.evaluate(() => {
                const titleSelectors = [
                    '.title',
                    'h1',
                    '.note-content .title',
                    '.content-title',
                    'meta[property="og:title"]'
                ];

                for (const selector of titleSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        if (selector.includes('meta')) {
                            return element.getAttribute('content');
                        }
                        return element.textContent.trim();
                    }
                }
                return '未知标题';
            });

            this.assets.title = title.replace(/[<>:"/\\|?*]/g, '_');
            this.logger.log(`开始获取内容：${this.assets.title}`);

            // 获取图片URL
            const images = await page.evaluate(() => {
                const containers = document.querySelectorAll('.video-player-media, .media-container');
                const imgUrls = new Set();

                containers.forEach(container => {
                    const imgs = container.querySelectorAll('img');
                    imgs.forEach(img => {
                        const src = img.getAttribute('data-src') || img.getAttribute('src');
                        if (src && !src.includes('data:image')) {
                            imgUrls.add(src);
                        }
                    });
                });

                return Array.from(imgUrls);
            });

            this.assets.images = images;
            this.logger.log(`找到 ${images.length} 张图片`);

            // 获取视频URL
            const videos = await page.evaluate(() => {
                const containers = document.querySelectorAll('.video-player-media, .media-container');
                const videoUrls = new Set();

                containers.forEach(container => {
                    const videoElements = container.querySelectorAll('video');
                    videoElements.forEach(video => {
                        const src = video.getAttribute('src') || video.getAttribute('data-src');
                        if (src) {
                            videoUrls.add(src);
                        }
                    });
                });

                return Array.from(videoUrls);
            });

            this.assets.videos = videos;
            this.logger.log(`找到 ${videos.length} 个视频`);

            return this.assets;

        } catch (error) {
            this.logger.error(`爬取失败: ${error.message}`);
            throw error;
        } finally {
            await browser.close();
        }
    }

    async downloadAll(): Promise<DownloadResult> {
        const assets = this.assets;
        try {
            // 创建下载目录
            const downloadDir = path.join(process.cwd(), 'downloads', assets.title);
            await fs.ensureDir(downloadDir);

            this.logger.log(`开始下载内容：${assets.title}`);

            // 下载图片
            for (let [index, imageUrl] of assets.images.entries()) {
                try {
                    if (!imageUrl.startsWith('http')) {
                        imageUrl = 'https:' + imageUrl;
                    }
                    const response = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        headers: {
                            'Referer': 'https://www.xiaohongshu.com',
                            'User-Agent': this.getRandomUserAgent()
                        }
                    });
                    const imagePath = path.join(downloadDir, `image_${index + 1}.jpg`);
                    await fs.writeFile(imagePath, response.data);
                    this.logger.log(`已下载图片 ${index + 1}/${assets.images.length}`);
                } catch (error) {
                    this.logger.error(`下载图片失败: ${error.message}`);
                }
            }

            // 下载视频
            for (let [index, videoUrl] of assets.videos.entries()) {
                try {
                    if (!videoUrl.startsWith('http')) {
                        videoUrl = 'https:' + videoUrl;
                    }

                    if (videoUrl.startsWith('blob:')) {
                        this.logger.warn(`跳过blob类型视频: ${videoUrl}`);
                        continue;
                    }

                    const response = await axios.get(videoUrl, {
                        responseType: 'arraybuffer',
                        headers: {
                            'Referer': 'https://www.xiaohongshu.com',
                            'User-Agent': this.getRandomUserAgent()
                        }
                    });
                    const videoPath = path.join(downloadDir, `video_${index + 1}.mp4`);
                    await fs.writeFile(videoPath, response.data);
                    this.logger.log(`已下载视频 ${index + 1}/${assets.videos.length}`);
                } catch (error) {
                    this.logger.error(`下载视频失败: ${error.message}`);
                }
            }

            return {
                title: assets.title,
                imagesCount: assets.images.length,
                videosCount: assets.videos.length,
                downloadPath: downloadDir
            };

        } catch (error) {
            this.logger.error(`下载失败: ${error.message}`);
            throw error;
        }
    }

    private getRandomUserAgent(): string {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }
} 



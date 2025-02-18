import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

@Injectable()
export class CrawlerHomeService {
    private readonly logger = new Logger(CrawlerHomeService.name);

    constructor() {
        puppeteer.use(StealthPlugin());
    }

    async crawlUserHome(homeUrl: string) {
        const browser = await puppeteer.launch({
            headless: true,
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

            // 访问用户主页
            await page.goto(homeUrl, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            // 获取用户名称作为文件夹名
            const username = await page.evaluate(() => {
                const nameElement = document.querySelector('.user-name') || document.querySelector('.name');
                return nameElement ? nameElement.textContent.trim() : '未知用户';
            });

            const sanitizedUsername = username.replace(/[<>:"/\\|?*]/g, '_');
            const downloadDir = path.join(process.cwd(), 'downloads', sanitizedUsername);
            await fs.ensureDir(downloadDir);

            this.logger.log(`开始获取用户 ${username} 的内容`);

            // 获取所有笔记项目
            const items = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.note-item')).map(item => ({
                    href: item.querySelector('a').href,
                }));
            });

            this.logger.log(`找到 ${items.length} 个笔记`);

            // 用于存储所有笔记的媒体URL
            const allMediaUrls = {
                images: [],
                videos: []
            };

            // 遍历每个笔记
            for (let [index, item] of items.entries()) {
                try {
                    const notePage = await browser.newPage();
                    await notePage.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
                    
                    await notePage.goto(item.href, {
                        waitUntil: 'networkidle0',
                        timeout: 30000
                    });

                    // 等待内容加载
                    await notePage.waitForSelector('.video-player-media, .media-container');

                    // 获取媒体URL
                    const mediaUrls = await notePage.evaluate(() => {
                        const containers = document.querySelectorAll('.video-player-media, .media-container');
                        const urls = {
                            images: new Set(),
                            videos: new Set()
                        };

                        containers.forEach(container => {
                            container.querySelectorAll('img').forEach(img => {
                                const src = img.getAttribute('data-src') || img.getAttribute('src');
                                if (src && !src.includes('data:image')) {
                                    urls.images.add(src);
                                }
                            });

                            container.querySelectorAll('video').forEach(video => {
                                const src = video.getAttribute('src') || video.getAttribute('data-src');
                                if (src) {
                                    urls.videos.add(src);
                                }
                            });
                        });

                        return {
                            images: Array.from(urls.images),
                            videos: Array.from(urls.videos)
                        };
                    });

                    // 将当前笔记的媒体URL添加到总集合中
                    allMediaUrls.images.push(...mediaUrls.images);
                    allMediaUrls.videos.push(...mediaUrls.videos);

                    await notePage.close();
                    
                    // 随机延迟，避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

                } catch (error) {
                    this.logger.error(`处理笔记失败: ${error.message}`);
                }
            }

            // 返回所有收集到的数据
            return {
                username: sanitizedUsername,
                notesCount: items.length,
                mediaUrls: allMediaUrls
            };

        } catch (error) {
            this.logger.error(`爬取用户主页失败: ${error.message}`);
            throw error;
        } finally {
            await browser.close();
        }
    }
} 
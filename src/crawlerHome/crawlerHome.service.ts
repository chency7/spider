import { Injectable, Logger, Query } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

@Injectable()
export class CrawlerHomeService {
    // 创建日志记录器实例
    private readonly logger = new Logger(CrawlerHomeService.name);

    constructor() {
        // 初始化时启用 Stealth 插件，用于防止被网站检测为爬虫
        puppeteer.use(StealthPlugin());
    }

    /**
     * 爬取用户主页内容
     * @param homeUrl 用户主页URL
     * @returns 包含用户信息和媒体内容的对象
     */
    async crawlUserHome(homeUrl: string) {
        // 启动浏览器实例，设置为可视模式
        const browser = await puppeteer.launch({
            headless: false,
            protocolTimeout: 1000000, // 增加协议超时时间到1000秒
            args: [
                '--no-sandbox', // 禁用沙箱模式
                '--disable-setuid-sandbox', // 禁用 setuid 沙箱
                '--disable-web-security', // 禁用网页安全性检查
                '--disable-features=IsolateOrigins,site-per-process', // 禁用站点隔离
                '--disable-site-isolation-trials' // 禁用站点隔离测试
            ],
        });

        try {
            const page = await browser.newPage();
            
            // 设置页面超时
            page.setDefaultTimeout(1000000); // 设置页面操作超时为1000秒

            // 设置随机用户代理，模拟不同的浏览器环境
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                //'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
            ];
            await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
            // 设置浏览器视窗大小
            await page.setViewport({ width: 1920, height: 1080 });

            // 访问目标页面，等待网络空闲
            await page.goto(homeUrl, {
                waitUntil: 'networkidle0', // 等待网络请求完成
                timeout: 3000000 // 30秒超时
            });

            // 在页面中执行脚本获取用户名
            const username = await page.evaluate(() => {
                const nameElement = document.querySelector('.user-name') || document.querySelector('.name');
                return nameElement ? nameElement.textContent.trim() : '未知用户';
            });

            // 清理用户名中的非法字符，创建下载目录
            const sanitizedUsername = username.replace(/[<>:"/\\|?*]/g, '_');
            const downloadDir = path.join(process.cwd(), 'downloads', sanitizedUsername);
            await fs.ensureDir(downloadDir);

            this.logger.log(`开始获取用户 ${username} 的内容`);

            // 优化滚动逻辑
            const items = await page.evaluate(async () => {
                const images = new Set(); // 使用 Set 来存储唯一的图片URL
                
                // 创建图片变化的观察器
                const createImageObserver = () => {
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                                const img = mutation.target as HTMLImageElement;
                                const imgSrc = img.getAttribute('data-src') || img.getAttribute('src');
                                if (imgSrc && !imgSrc.includes('placeholder')) {
                                    images.add(imgSrc);
                                    console.log('发现新图片:', imgSrc);
                                    console.log('当前总图片数:', images.size);
                                }
                            }
                        });
                    });

                    return observer;
                };

                // 获取内容函数
                const getImages = () => {
                    const feedsContainer = document.querySelector('.feeds-tab-container');
                    if (!feedsContainer) {
                        console.log('未找到内容容器');
                        return false;
                    }

                    const items = feedsContainer.querySelectorAll('.note-item');
                    console.log('找到笔记数量:', items.length);

                   const cover = items[0].querySelectorAll('.cover')[0] as HTMLElement;
                   console.log('cover',cover);

                   cover.click()
                    
                    // 为每个图片元素添加观察器
                    items.forEach((item, index) => {
                        const img = item.querySelector('img');
                        console.log('找到图片:', img);
                        if (img) {
                            const observer = createImageObserver();
                            observer.observe(img, {
                                attributes: true,
                                attributeFilter: ['src', 'data-src']
                            });

                            // 立即检查当前图片
                            const imgSrc = img.getAttribute('data-src') || img.getAttribute('src');
                            if (imgSrc && !imgSrc.includes('placeholder')) {
                                images.add(imgSrc);
                            }
                        }
                    });

                    return true;
                };

                // 检查是否到达底部
                const isAtBottom = () => {
                    const scrollHeight = Math.max(
                        document.documentElement.scrollHeight,
                        document.body.scrollHeight
                    );
                    const scrollPosition = window.pageYOffset + window.innerHeight;
                    const buffer = 100; // 底部缓冲区

                    const isBottom = scrollPosition >= scrollHeight - buffer;
                    console.log('滚动状态:', {
                        位置: scrollPosition,
                        总高度: scrollHeight,
                        是否到底: isBottom
                    });
                    return isBottom;
                };

                // 减慢滚动速度
                const smoothScroll = async () => {
                    const distance = 200;
                    const delay = 500;
                    
                    const currentPosition = window.pageYOffset;
                    window.scrollTo({
                        top: currentPosition + distance,
                        behavior: 'smooth'
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                };

                let noNewImagesCount = 0;
                const maxNoNewImages = 3; // 连续3次没有新图片就停止
                let lastImagesCount = 0;

                // 持续滚动直到到达底部
                while (!isAtBottom() || noNewImagesCount < maxNoNewImages) {
                    getImages();
                    await smoothScroll();
                    
                    // 检查是否有新图片
                    const currentSize = images.size;
                    if (currentSize === lastImagesCount) {
                        noNewImagesCount++;
                        console.log(`未发现新图片，计数: ${noNewImagesCount}`);
                    } else {
                        noNewImagesCount = 0;
                        lastImagesCount = currentSize;
                    }

                    // 如果到达底部，多等待一会儿确保加载完成
                    if (isAtBottom()) {
                        console.log('已到达底部，等待最后的内容加载...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                    // 短暂等待以避免过快滚动
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                console.log(`滚动结束，总共收集到 ${images.size} 张图片`);
                return Array.from(images); // 转换Set为数组返回
            }, { timeout: 1000000 });

            // 保留其他日志
            this.logger.log('爬取到的图片URLs:', items);
            this.logger.log(`找到 ${items.length} 个笔记`);

            // 在返回结果前验证选择器
            await page.evaluate(() => {
                const selectors = {
                    container: '.feeds-tab-container',
                    items: '.note-item',
                    images: '.note-item img'
                };
                
                for (const [key, selector] of Object.entries(selectors)) {
                    const elements = document.querySelectorAll(selector);
                    console.log(`${key} selector found ${elements.length} elements`);
                }
            });

            // 如果需要在 Node.js 环境中记录日志，可以在这里添加
            this.logger.log(`爬取完成，共发现 ${items.length} 张图片`);

            // 返回爬取结果
            return {
                title: sanitizedUsername,
                images: items,
                videos: []
            };

        } catch (error) {
            // 错误处理
            this.logger.error(`爬取用户主页失败: ${error.message}`);
            throw error;
        } finally {
            // 确保浏览器实例被关闭
            await browser.close();
        }
    }
} 
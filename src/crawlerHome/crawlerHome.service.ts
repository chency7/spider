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
                //'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
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
                const images = []
                const feedsContainer = document.querySelector('.feeds-tab-container');
                if (!feedsContainer) {
                    return [];
                }

                const items = feedsContainer.querySelectorAll('.note-item')
                
                items.forEach(item => {
                    const imgSrc = item.querySelector('img').getAttribute('data-src') || 
                                 item.querySelector('img').getAttribute('src');
                    if (imgSrc) {
                        images.push(imgSrc);
                    }
                });

                return images;
            });

            console.log(items);

            this.logger.log(`找到 ${items.length} 个笔记`);

            // 返回符合 Assets 接口的数据格式
            return {
                title: sanitizedUsername,
                images: items,
                videos: []
            };

        } catch (error) {
            this.logger.error(`爬取用户主页失败: ${error.message}`);
            throw error;
        } finally {
            await browser.close();
        }
    }
} 
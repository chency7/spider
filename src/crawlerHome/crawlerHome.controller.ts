import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { CrawlerHomeService } from './crawlerHome.service';

@Controller('api')
export class CrawlerHomeController {
    constructor(private readonly crawlerHomeService: CrawlerHomeService) { }

    @Post('crawler/home')
    async crawlUserHome(@Body('url') url: string) {
        if (!url) {
            throw new HttpException('URL不能为空', HttpStatus.BAD_REQUEST);
        }

        // 验证URL格式（用户主页链接）
        if (!url.includes('xiaohongshu.com/user/')) {
            throw new HttpException('请输入有效的小红书用户主页链接', HttpStatus.BAD_REQUEST);
        }

        try {
            return await this.crawlerHomeService.crawlUserHome(url);
        } catch (error) {
            throw new HttpException(
                `爬取失败: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
} 
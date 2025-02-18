import { Controller, Get, Query, Post, Body, HttpException, HttpStatus, Res } from '@nestjs/common';
import { getAllAssetsByUrl } from './crawler.service';
import { Response } from 'express';
import axios from 'axios';

@Controller('api')
export class CrawlerController {
    constructor(private readonly crawlerService: getAllAssetsByUrl) { }

    @Get('crawler/getAssets')
    async getAssets(@Query('url') url: string) {
        if (!url) {
            throw new HttpException('URL不能为空', HttpStatus.BAD_REQUEST);
        }

        // 验证URL格式
        if (!url.includes('xiaohongshu.com') && !url.includes('xhslink.com')) {
            throw new HttpException('请输入有效的小红书链接', HttpStatus.BAD_REQUEST);
        }

        try {
            return await this.crawlerService.crawlXiaohongshu(url);
        } catch (error) {
            throw new HttpException(
                `爬取失败: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Post('download')
    async downloadAssets() {
        try {
            return await this.crawlerService.downloadAll();
        } catch (error) {
            throw new HttpException(
                `下载失败: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Get('proxy')
    async proxyImage(@Query('url') url: string, @Res() res: Response) {
        if (!url) {
            throw new HttpException('URL不能为空', HttpStatus.BAD_REQUEST);
        }

        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: {
                    'Referer': 'https://www.xiaohongshu.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            // 设置响应头
            res.set({
                'Content-Type': response.headers['content-type'],
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*'  // 允许跨域访问
            });

            // 将图片数据流传输到客户端
            response.data.pipe(res);
        } catch (error) {
            throw new HttpException(
                `获取图片失败: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
} 
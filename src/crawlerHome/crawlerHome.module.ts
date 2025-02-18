import { Module } from '@nestjs/common';
import { CrawlerHomeController } from './crawlerHome.controller';
import { CrawlerHomeService } from './crawlerHome.service';

@Module({
    controllers: [CrawlerHomeController],
    providers: [CrawlerHomeService],
})
export class CrawlerHomeModule {} 
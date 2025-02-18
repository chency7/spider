import { Module } from '@nestjs/common';
import { getAllAssetsByUrl } from './crawler.service';
import { CrawlerController } from './crawler.controller';

@Module({
    controllers: [CrawlerController],
    providers: [getAllAssetsByUrl],
})
export class CrawlerModule { } 
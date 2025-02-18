import { Module } from '@nestjs/common';
import { CrawlerModule } from './crawler/crawler.module';
import { CrawlerHomeModule } from './crawlerHome/crawlerHome.module';
import { CrawlerController } from './crawler/crawler.controller';
import { getAllAssetsByUrl } from './crawler/crawler.service';

@Module({
    imports: [CrawlerModule, CrawlerHomeModule],
    controllers: [CrawlerController],
    providers: [getAllAssetsByUrl],
})
export class AppModule { } 
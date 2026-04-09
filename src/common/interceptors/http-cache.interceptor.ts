import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

@Injectable()
export class HttpCacheInterceptor extends CacheInterceptor {
    trackBy(context: ExecutionContext): string | undefined {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const url = request.url;
        const query = request.query as any;

        if (!url) {
            return undefined;
        }

        // Fast path: if no lat/lng, use default URL (which is req.url)
        if (!query || !query.lat || !query.lng) {
            return super.trackBy(context);
        }

        // Geohash/Grid approach: Round lat/lng to 2 decimal places (~1.1 km precision)
        // This dramatically increases cache hit rates for nearby users searching the same general area
        const roundedLat = parseFloat(query.lat as string).toFixed(2);
        const roundedLng = parseFloat(query.lng as string).toFixed(2);

        // Reconstruct URL without exact lat/lng to group them into the same cache bucket
        const urlParams = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            if (key !== 'lat' && key !== 'lng') {
                urlParams.append(key, String(value));
            }
        }

        const pathname = url.split('?')[0];
        const gridKey = `grid_${roundedLat}_${roundedLng}`;
        const searchString = urlParams.toString();

        return `${pathname}?${searchString}&${gridKey}`;
    }
}

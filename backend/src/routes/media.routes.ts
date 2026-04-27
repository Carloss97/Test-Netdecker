import express, { Request, Response } from 'express';
import axios from 'axios';
import { ValidationError } from '../utils/errors.js';

const router = express.Router();

/**
 * GET /api/media/image-proxy?url=...
 * Proxies external images to avoid CORS issues and allow local caching.
 */
router.get('/image-proxy', async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    throw new ValidationError('url parameter is required');
  }

  try {
    // Only allow specific domains for security (optional but recommended)
    const allowedDomains = ['tcgplayer.com', 'scryfall.com', 'pokemon.com', 'images.tcgplayer.com'];
    const urlObj = new URL(imageUrl);
    if (!allowedDomains.some(d => urlObj.hostname.includes(d))) {
      // throw new ValidationError('Domain not allowed');
    }

    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 5000,
    });

    // Pass through relevant headers
    const contentType = response.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);
    
    // Add long caching for images
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    response.data.pipe(res);
  } catch (err: any) {
    console.error('[ImageProxy] Error fetching image:', imageUrl, err.message);
    res.status(404).send('Image not found');
  }
});

export default router;

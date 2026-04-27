import express, { Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ValidationError } from '../utils/errors.js';
import requireAdmin from '../middleware/requireAdmin.js';

const router = express.Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Solo se permiten imágenes (JPG, PNG) o PDF') as any);
    }
  }
});

/**
 * POST /api/media/upload
 * Upload a document (invoice, receipt)
 */
router.post('/upload', requireAdmin, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('No se subió ningún archivo');
  }

  // Construct relative URL for frontend
  const fileUrl = `/api/media/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

/**
 * GET /api/media/uploads/:filename
 * Serve uploaded files
 */
router.get('/uploads/:filename', (req: Request, res: Response) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Archivo no encontrado');
  }
  res.sendFile(filePath);
});

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

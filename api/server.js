/**
 * TAMMEY BLOG API — server.js (MySQL / Cloudways)
 * Node.js + Express + mysql2
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const slugify = require('slugify');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());

// Serve uploaded images statically
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── MySQL CONNECTION POOL ─────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME     || 'ndnnwpjrrz',
  user:     process.env.DB_USER     || 'ndnnwpjrrz',
  password: process.env.DB_PASSWORD || '',
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
});

// Test connection on startup
pool.getConnection()
  .then(conn => { console.log('✅  MySQL connected'); conn.release(); })
  .catch(err  => console.error('❌  MySQL connection error:', err.message));

// ── AUTH MIDDLEWARE ───────────────────────────────────────
function requireAdmin(req, res, next) {
  const secret = req.headers['admin-secret'] || req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── FILE UPLOAD ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /image\/(jpeg|png|webp|gif|svg)/.test(file.mimetype)
      ? cb(null, true) : cb(new Error('Images only')),
});

// ════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/categories
app.get('/api/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, slug, name_ar, name_en, color, sort_order FROM blog_categories ORDER BY sort_order'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/posts?page=1&limit=9&category=slug&featured=true
app.get('/api/posts', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page  || '1'));
    const limit    = Math.min(50, parseInt(req.query.limit || '9'));
    const offset   = (page - 1) * limit;
    const category = req.query.category || null;
    const featured = req.query.featured === 'true' ? 1 : null;

    let where  = `p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW())`;
    const args = [];

    if (category) { where += ' AND c.slug = ?'; args.push(category); }
    if (featured !== null) { where += ' AND p.is_featured = ?'; args.push(featured); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM blog_posts p
       JOIN blog_categories c ON c.id = p.category_id
       WHERE ${where}`, args
    );

    const [posts] = await pool.query(
      `SELECT p.id, p.slug, p.title_ar, p.title_en,
              p.excerpt_ar, p.excerpt_en, p.cover_image,
              p.read_time_min, p.is_featured, p.published_at,
              c.slug AS category_slug, c.name_ar AS category_ar,
              c.name_en AS category_en, c.color AS category_color,
              a.name_ar AS author_ar, a.name_en AS author_en,
              a.avatar_url AS author_avatar
       FROM blog_posts p
       JOIN blog_categories c ON c.id = p.category_id
       LEFT JOIN blog_authors a ON a.id = p.author_id
       WHERE ${where}
       ORDER BY p.published_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    res.json({ total, page, limit, pages: Math.ceil(total / limit), posts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/posts/:slug
app.get('/api/posts/:slug', async (req, res) => {
  try {
    const [[post]] = await pool.query(
      `SELECT p.id, p.slug, p.title_ar, p.title_en,
              p.excerpt_ar, p.excerpt_en, p.body_ar, p.body_en,
              p.cover_image, p.read_time_min, p.is_featured,
              p.published_at, p.updated_at,
              c.slug AS category_slug, c.name_ar AS category_ar,
              c.name_en AS category_en, c.color AS category_color,
              a.name_ar AS author_ar, a.name_en AS author_en,
              a.title_ar AS author_title_ar, a.title_en AS author_title_en,
              a.avatar_url AS author_avatar
       FROM blog_posts p
       JOIN blog_categories c ON c.id = p.category_id
       LEFT JOIN blog_authors a ON a.id = p.author_id
       WHERE p.slug = ? AND p.status = 'published'`,
      [req.params.slug]
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const [tags] = await pool.query(
      `SELECT t.slug, t.name_ar, t.name_en
       FROM blog_tags t
       JOIN blog_post_tags pt ON pt.tag_id = t.id
       JOIN blog_posts p ON p.id = pt.post_id
       WHERE p.slug = ?`,
      [req.params.slug]
    );

    post.tags = tags;
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/admin/posts
app.get('/api/admin/posts', requireAdmin, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(100, parseInt(req.query.limit || '20'));
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.title_ar, p.title_en, p.status,
              p.is_featured, p.published_at, p.created_at, p.updated_at,
              c.name_ar AS category_ar, c.name_en AS category_en
       FROM blog_posts p
       JOIN blog_categories c ON c.id = p.category_id
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/upload
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// POST /api/posts  — create
app.post('/api/posts', requireAdmin, async (req, res) => {
  try {
    const {
      category_id, author_id = null,
      title_ar, title_en = null,
      excerpt_ar = null, excerpt_en = null,
      body_ar, body_en = null,
      cover_image = null, read_time_min = 5,
      is_featured = false, status = 'draft',
      published_at = null, tags = [],
    } = req.body;

    if (!title_ar || !body_ar || !category_id)
      return res.status(400).json({ error: 'title_ar, body_ar, and category_id are required' });

    const slug = slugify(title_ar, { locale: 'ar', lower: true, strict: false })
               + '-' + Date.now();

    const [result] = await pool.query(
      `INSERT INTO blog_posts
        (slug, category_id, author_id, title_ar, title_en,
         excerpt_ar, excerpt_en, body_ar, body_en,
         cover_image, read_time_min, is_featured, status, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [slug, category_id, author_id, title_ar, title_en,
       excerpt_ar, excerpt_en, body_ar, body_en,
       cover_image, read_time_min, is_featured ? 1 : 0, status,
       published_at || null]
    );

    const newId = result.insertId;

    for (const tagId of tags) {
      await pool.query(
        'INSERT IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)',
        [newId, tagId]
      );
    }

    res.status(201).json({ id: newId, slug });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/posts/:id  — update
app.put('/api/posts/:id', requireAdmin, async (req, res) => {
  try {
    const {
      category_id, author_id, title_ar, title_en,
      excerpt_ar, excerpt_en, body_ar, body_en,
      cover_image, read_time_min, is_featured, status, published_at, tags,
    } = req.body;

    await pool.query(
      `UPDATE blog_posts SET
        category_id=?, author_id=?, title_ar=?, title_en=?,
        excerpt_ar=?, excerpt_en=?, body_ar=?, body_en=?,
        cover_image=?, read_time_min=?, is_featured=?, status=?, published_at=?
       WHERE id=?`,
      [category_id, author_id || null, title_ar, title_en || null,
       excerpt_ar || null, excerpt_en || null, body_ar, body_en || null,
       cover_image || null, read_time_min || 5, is_featured ? 1 : 0,
       status || 'draft', published_at || null, req.params.id]
    );

    if (Array.isArray(tags)) {
      await pool.query('DELETE FROM blog_post_tags WHERE post_id = ?', [req.params.id]);
      for (const tagId of tags) {
        await pool.query(
          'INSERT IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)',
          [req.params.id, tagId]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/posts/:id/publish
app.patch('/api/posts/:id/publish', requireAdmin, async (req, res) => {
  try {
    const { publish } = req.body;
    await pool.query(
      'UPDATE blog_posts SET status=?, published_at=? WHERE id=?',
      [publish ? 'published' : 'draft', publish ? new Date() : null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/posts/:id
app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`✅  Tammey API running on port ${PORT}`)
);

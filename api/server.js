/**
 * TAMMEY BLOG API — server.js
 * Node.js + Express + SQL Server (mssql)
 *
 * Routes:
 *   GET  /api/posts              — list posts (paginated, filterable)
 *   GET  /api/posts/:slug        — single post by slug
 *   GET  /api/categories         — all categories
 *   POST /api/posts              — create post       [requires Admin-Secret header]
 *   PUT  /api/posts/:id          — update post       [requires Admin-Secret header]
 *   PATCH /api/posts/:id/publish — publish/unpublish [requires Admin-Secret header]
 *   DELETE /api/posts/:id        — delete post       [requires Admin-Secret header]
 *   POST /api/upload             — upload cover image [requires Admin-Secret header]
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const sql      = require('mssql');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const slugify  = require('slugify');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));
app.use(express.json());

// Serve uploaded images statically
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── SQL SERVER CONNECTION POOL ────────────────────────────
const dbConfig = {
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_DATABASE || 'TammeyDB',
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt:              process.env.DB_ENCRYPT    === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(dbConfig);
  return pool;
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────
function requireAdmin(req, res, next) {
  const secret = req.headers['admin-secret'] || req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing Admin-Secret header' });
  }
  next();
}

// ── FILE UPLOAD (multer) ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif|svg)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// ════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/categories
app.get('/api/categories', async (_req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT id, slug, name_ar, name_en, color, sort_order
      FROM BlogCategories
      ORDER BY sort_order
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/posts?page=1&limit=9&category=youth-policy&lang=ar&featured=true
app.get('/api/posts', async (req, res) => {
  try {
    const db       = await getPool();
    const page     = Math.max(1, parseInt(req.query.page  || '1'));
    const limit    = Math.min(50, parseInt(req.query.limit || '9'));
    const offset   = (page - 1) * limit;
    const category = req.query.category || null;
    const featured = req.query.featured === 'true' ? 1 : null;

    const request = db.request();
    request.input('offset',   sql.Int, offset);
    request.input('limit',    sql.Int, limit);

    let where = `p.status = 'published' AND p.published_at <= GETDATE()`;
    if (category) {
      request.input('catSlug', sql.NVarChar, category);
      where += ` AND c.slug = @catSlug`;
    }
    if (featured !== null) {
      request.input('featured', sql.Bit, featured);
      where += ` AND p.is_featured = @featured`;
    }

    const countQ = await request.query(
      `SELECT COUNT(*) AS total
       FROM BlogPosts p
       JOIN BlogCategories c ON c.id = p.category_id
       WHERE ${where}`
    );

    const listQ = await request.query(`
      SELECT
        p.id, p.slug, p.title_ar, p.title_en,
        p.excerpt_ar, p.excerpt_en, p.cover_image,
        p.read_time_min, p.is_featured, p.published_at,
        c.slug AS category_slug, c.name_ar AS category_ar, c.name_en AS category_en, c.color AS category_color,
        a.name_ar AS author_ar, a.name_en AS author_en, a.avatar_url AS author_avatar
      FROM BlogPosts p
      JOIN BlogCategories c ON c.id = p.category_id
      LEFT JOIN BlogAuthors  a ON a.id = p.author_id
      WHERE ${where}
      ORDER BY p.published_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      total:    countQ.recordset[0].total,
      page,
      limit,
      pages:    Math.ceil(countQ.recordset[0].total / limit),
      posts:    listQ.recordset,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/posts/:slug  (single post with full body)
app.get('/api/posts/:slug', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('slug', sql.NVarChar, req.params.slug)
      .query(`
        SELECT
          p.id, p.slug, p.title_ar, p.title_en,
          p.excerpt_ar, p.excerpt_en,
          p.body_ar, p.body_en,
          p.cover_image, p.read_time_min, p.is_featured, p.published_at, p.updated_at,
          c.slug AS category_slug, c.name_ar AS category_ar, c.name_en AS category_en, c.color AS category_color,
          a.name_ar AS author_ar, a.name_en AS author_en, a.title_ar AS author_title_ar,
          a.title_en AS author_title_en, a.avatar_url AS author_avatar
        FROM BlogPosts p
        JOIN BlogCategories c ON c.id = p.category_id
        LEFT JOIN BlogAuthors  a ON a.id = p.author_id
        WHERE p.slug = @slug AND p.status = 'published'
      `);

    if (!result.recordset.length) return res.status(404).json({ error: 'Post not found' });

    // Fetch tags
    const tagsQ = await db.request()
      .input('slug', sql.NVarChar, req.params.slug)
      .query(`
        SELECT t.slug, t.name_ar, t.name_en
        FROM BlogTags t
        JOIN BlogPostTags pt ON pt.tag_id = t.id
        JOIN BlogPosts p ON p.id = pt.post_id
        WHERE p.slug = @slug
      `);

    const post = result.recordset[0];
    post.tags  = tagsQ.recordset;
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ════════════════════════════════════════════════════════════
//  ADMIN ROUTES (require Admin-Secret header)
// ════════════════════════════════════════════════════════════

// POST /api/upload  — upload cover image
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// POST /api/posts  — create new post
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

    const db = await getPool();
    const result = await db.request()
      .input('slug',          sql.NVarChar, slug)
      .input('category_id',   sql.Int,      category_id)
      .input('author_id',     sql.Int,      author_id)
      .input('title_ar',      sql.NVarChar, title_ar)
      .input('title_en',      sql.NVarChar, title_en)
      .input('excerpt_ar',    sql.NVarChar, excerpt_ar)
      .input('excerpt_en',    sql.NVarChar, excerpt_en)
      .input('body_ar',       sql.NVarChar(sql.MAX), body_ar)
      .input('body_en',       sql.NVarChar(sql.MAX), body_en)
      .input('cover_image',   sql.NVarChar, cover_image)
      .input('read_time_min', sql.Int,      read_time_min)
      .input('is_featured',   sql.Bit,      is_featured ? 1 : 0)
      .input('status',        sql.NVarChar, status)
      .input('published_at',  sql.DateTime2, published_at || null)
      .query(`
        INSERT INTO BlogPosts
          (slug, category_id, author_id, title_ar, title_en, excerpt_ar, excerpt_en,
           body_ar, body_en, cover_image, read_time_min, is_featured, status, published_at)
        OUTPUT INSERTED.id, INSERTED.slug
        VALUES
          (@slug, @category_id, @author_id, @title_ar, @title_en, @excerpt_ar, @excerpt_en,
           @body_ar, @body_en, @cover_image, @read_time_min, @is_featured, @status, @published_at)
      `);

    const newPost = result.recordset[0];

    // Insert tags
    if (tags.length) {
      for (const tagId of tags) {
        await db.request()
          .input('post_id', sql.Int, newPost.id)
          .input('tag_id',  sql.Int, tagId)
          .query(`INSERT INTO BlogPostTags (post_id, tag_id) VALUES (@post_id, @tag_id)`);
      }
    }

    res.status(201).json({ id: newPost.id, slug: newPost.slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// PUT /api/posts/:id  — update existing post
app.put('/api/posts/:id', requireAdmin, async (req, res) => {
  try {
    const {
      category_id, author_id,
      title_ar, title_en,
      excerpt_ar, excerpt_en,
      body_ar, body_en,
      cover_image, read_time_min,
      is_featured, status, published_at,
      tags,
    } = req.body;

    const db = await getPool();
    await db.request()
      .input('id',            sql.Int,      req.params.id)
      .input('category_id',   sql.Int,      category_id)
      .input('author_id',     sql.Int,      author_id   || null)
      .input('title_ar',      sql.NVarChar, title_ar)
      .input('title_en',      sql.NVarChar, title_en    || null)
      .input('excerpt_ar',    sql.NVarChar, excerpt_ar  || null)
      .input('excerpt_en',    sql.NVarChar, excerpt_en  || null)
      .input('body_ar',       sql.NVarChar(sql.MAX), body_ar)
      .input('body_en',       sql.NVarChar(sql.MAX), body_en || null)
      .input('cover_image',   sql.NVarChar, cover_image || null)
      .input('read_time_min', sql.Int,      read_time_min || 5)
      .input('is_featured',   sql.Bit,      is_featured ? 1 : 0)
      .input('status',        sql.NVarChar, status || 'draft')
      .input('published_at',  sql.DateTime2, published_at || null)
      .query(`
        UPDATE BlogPosts SET
          category_id=@category_id, author_id=@author_id,
          title_ar=@title_ar, title_en=@title_en,
          excerpt_ar=@excerpt_ar, excerpt_en=@excerpt_en,
          body_ar=@body_ar, body_en=@body_en,
          cover_image=@cover_image, read_time_min=@read_time_min,
          is_featured=@is_featured, status=@status, published_at=@published_at
        WHERE id=@id
      `);

    // Replace tags
    if (Array.isArray(tags)) {
      await db.request().input('id', sql.Int, req.params.id)
        .query(`DELETE FROM BlogPostTags WHERE post_id=@id`);
      for (const tagId of tags) {
        await db.request()
          .input('post_id', sql.Int, req.params.id)
          .input('tag_id',  sql.Int, tagId)
          .query(`INSERT INTO BlogPostTags (post_id, tag_id) VALUES (@post_id, @tag_id)`);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// PATCH /api/posts/:id/publish  — quick publish / unpublish toggle
app.patch('/api/posts/:id/publish', requireAdmin, async (req, res) => {
  try {
    const { publish } = req.body; // true → publish, false → revert to draft
    const db = await getPool();
    await db.request()
      .input('id',     sql.Int,      req.params.id)
      .input('status', sql.NVarChar, publish ? 'published' : 'draft')
      .input('pub_at', sql.DateTime2, publish ? new Date() : null)
      .query(`UPDATE BlogPosts SET status=@status, published_at=@pub_at WHERE id=@id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/posts/:id
app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM BlogPosts WHERE id=@id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── ADMIN: list all posts (including drafts) ─────────────
app.get('/api/admin/posts', requireAdmin, async (req, res) => {
  try {
    const db     = await getPool();
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(50, parseInt(req.query.limit || '20'));
    const offset = (page - 1) * limit;

    const result = await db.request()
      .input('offset', sql.Int, offset)
      .input('limit',  sql.Int, limit)
      .query(`
        SELECT
          p.id, p.slug, p.title_ar, p.title_en, p.status,
          p.is_featured, p.published_at, p.created_at, p.updated_at,
          c.name_ar AS category_ar, c.name_en AS category_en
        FROM BlogPosts p
        JOIN BlogCategories c ON c.id = p.category_id
        ORDER BY p.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Tammey Blog API running at http://localhost:${PORT}`);
  console.log(`    SQL Server: ${dbConfig.server}/${dbConfig.database}`);
});

-- ============================================================
--  TAMMEY BLOG — SQL Server Schema
--  Run once on your SQL Server database to set up all tables.
-- ============================================================

-- ── 1. CATEGORIES ──────────────────────────────────────────
CREATE TABLE [dbo].[BlogCategories] (
  [id]         INT           IDENTITY(1,1) PRIMARY KEY,
  [slug]       NVARCHAR(80)  NOT NULL UNIQUE,   -- e.g. 'youth-policy'
  [name_ar]    NVARCHAR(120) NOT NULL,           -- Arabic display name
  [name_en]    NVARCHAR(120) NOT NULL,           -- English display name
  [color]      NVARCHAR(20)  NOT NULL DEFAULT '#6EC1E4',  -- badge color
  [sort_order] INT           NOT NULL DEFAULT 0,
  [created_at] DATETIME2     NOT NULL DEFAULT GETDATE()
);

-- ── 2. AUTHORS ─────────────────────────────────────────────
CREATE TABLE [dbo].[BlogAuthors] (
  [id]         INT           IDENTITY(1,1) PRIMARY KEY,
  [name_ar]    NVARCHAR(120) NOT NULL,
  [name_en]    NVARCHAR(120) NOT NULL,
  [title_ar]   NVARCHAR(200) NULL,   -- job title (Arabic)
  [title_en]   NVARCHAR(200) NULL,   -- job title (English)
  [avatar_url] NVARCHAR(500) NULL,   -- path or full URL to photo
  [created_at] DATETIME2     NOT NULL DEFAULT GETDATE()
);

-- ── 3. POSTS ───────────────────────────────────────────────
CREATE TABLE [dbo].[BlogPosts] (
  [id]            INT            IDENTITY(1,1) PRIMARY KEY,
  [slug]          NVARCHAR(200)  NOT NULL UNIQUE,   -- URL-friendly identifier
  [category_id]   INT            NOT NULL REFERENCES [dbo].[BlogCategories]([id]),
  [author_id]     INT            NULL     REFERENCES [dbo].[BlogAuthors]([id]),

  -- Arabic content
  [title_ar]      NVARCHAR(400)  NOT NULL,
  [excerpt_ar]    NVARCHAR(800)  NULL,
  [body_ar]       NVARCHAR(MAX)  NOT NULL,   -- full HTML/Markdown body

  -- English content
  [title_en]      NVARCHAR(400)  NULL,
  [excerpt_en]    NVARCHAR(800)  NULL,
  [body_en]       NVARCHAR(MAX)  NULL,

  -- Media
  [cover_image]   NVARCHAR(500)  NULL,   -- path or URL to cover photo
  [read_time_min] INT            NOT NULL DEFAULT 5,   -- estimated read time

  -- Status & scheduling
  [status]        NVARCHAR(20)   NOT NULL DEFAULT 'draft'
                    CHECK ([status] IN ('draft','published','archived')),
  [is_featured]   BIT            NOT NULL DEFAULT 0,
  [published_at]  DATETIME2      NULL,   -- NULL = not yet published
  [created_at]    DATETIME2      NOT NULL DEFAULT GETDATE(),
  [updated_at]    DATETIME2      NOT NULL DEFAULT GETDATE()
);

-- Auto-update [updated_at] on every UPDATE
CREATE TRIGGER [dbo].[trg_BlogPosts_UpdatedAt]
ON [dbo].[BlogPosts]
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE [dbo].[BlogPosts]
  SET [updated_at] = GETDATE()
  WHERE [id] IN (SELECT [id] FROM inserted);
END;

-- ── 4. TAGS ────────────────────────────────────────────────
CREATE TABLE [dbo].[BlogTags] (
  [id]      INT           IDENTITY(1,1) PRIMARY KEY,
  [slug]    NVARCHAR(80)  NOT NULL UNIQUE,
  [name_ar] NVARCHAR(120) NOT NULL,
  [name_en] NVARCHAR(120) NOT NULL
);

-- Many-to-many: posts ↔ tags
CREATE TABLE [dbo].[BlogPostTags] (
  [post_id] INT NOT NULL REFERENCES [dbo].[BlogPosts]([id]) ON DELETE CASCADE,
  [tag_id]  INT NOT NULL REFERENCES [dbo].[BlogTags]([id])  ON DELETE CASCADE,
  PRIMARY KEY ([post_id], [tag_id])
);

-- ── 5. INDEXES ─────────────────────────────────────────────
CREATE INDEX [IX_BlogPosts_status_published] ON [dbo].[BlogPosts] ([status], [published_at] DESC);
CREATE INDEX [IX_BlogPosts_category]         ON [dbo].[BlogPosts] ([category_id]);
CREATE INDEX [IX_BlogPosts_featured]         ON [dbo].[BlogPosts] ([is_featured]) WHERE [is_featured] = 1;

-- ── 6. SEED: DEFAULT CATEGORIES ────────────────────────────
INSERT INTO [dbo].[BlogCategories] ([slug], [name_ar], [name_en], [color], [sort_order]) VALUES
  ('youth-development', 'تنمية الشباب',    'Youth Development', '#6EC1E4', 1),
  ('research',          'أبحاث ودراسات',   'Research',          '#7d5730', 2),
  ('programs',          'برامج وأنشطة',    'Programs',          '#5a9b6e', 3),
  ('youth-policy',      'سياسات الشباب',   'Youth Policy',      '#9b6b5a', 4),
  ('success-stories',   'قصص نجاح',        'Success Stories',   '#c4872a', 5),
  ('news',              'أخبار وفعاليات',  'News & Events',     '#6b7280', 6);

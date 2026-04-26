-- ============================================================
--  TAMMEY BLOG — MySQL Schema
--  Run once in Adminer (or any MySQL client) on your database.
--  Database: ndnnwpjrrz
-- ============================================================

USE ndnnwpjrrz;

-- ── 1. CATEGORIES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `blog_categories` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `slug`       VARCHAR(80)  NOT NULL UNIQUE,
  `name_ar`    VARCHAR(120) NOT NULL,
  `name_en`    VARCHAR(120) NOT NULL,
  `color`      VARCHAR(20)  NOT NULL DEFAULT '#6EC1E4',
  `sort_order` INT          NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. AUTHORS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `blog_authors` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name_ar`    VARCHAR(120) NOT NULL,
  `name_en`    VARCHAR(120) NOT NULL,
  `title_ar`   VARCHAR(200) NULL,
  `title_en`   VARCHAR(200) NULL,
  `avatar_url` VARCHAR(500) NULL,
  `created_at` DATETIME     NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. POSTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `blog_posts` (
  `id`            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `slug`          VARCHAR(200) NOT NULL UNIQUE,
  `category_id`   INT          NOT NULL,
  `author_id`     INT          NULL,
  `title_ar`      VARCHAR(400) NOT NULL,
  `excerpt_ar`    TEXT         NULL,
  `body_ar`       LONGTEXT     NOT NULL,
  `title_en`      VARCHAR(400) NULL,
  `excerpt_en`    TEXT         NULL,
  `body_en`       LONGTEXT     NULL,
  `cover_image`   VARCHAR(500) NULL,
  `read_time_min` INT          NOT NULL DEFAULT 5,
  `status`        ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  `is_featured`   TINYINT(1)   NOT NULL DEFAULT 0,
  `published_at`  DATETIME     NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT NOW(),
  `updated_at`    DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (`category_id`) REFERENCES `blog_categories`(`id`),
  FOREIGN KEY (`author_id`)   REFERENCES `blog_authors`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. TAGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `blog_tags` (
  `id`      INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `slug`    VARCHAR(80) NOT NULL UNIQUE,
  `name_ar` VARCHAR(120) NOT NULL,
  `name_en` VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_post_tags` (
  `post_id` INT NOT NULL,
  `tag_id`  INT NOT NULL,
  PRIMARY KEY (`post_id`, `tag_id`),
  FOREIGN KEY (`post_id`) REFERENCES `blog_posts`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tag_id`)  REFERENCES `blog_tags`(`id`)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. INDEXES ─────────────────────────────────────────────
CREATE INDEX idx_posts_status     ON `blog_posts` (`status`, `published_at`);
CREATE INDEX idx_posts_category   ON `blog_posts` (`category_id`);
CREATE INDEX idx_posts_featured   ON `blog_posts` (`is_featured`);

-- ── 6. SEED: DEFAULT CATEGORIES ────────────────────────────
INSERT IGNORE INTO `blog_categories` (`slug`, `name_ar`, `name_en`, `color`, `sort_order`) VALUES
  ('youth-development', 'تنمية الشباب',   'Youth Development', '#6EC1E4', 1),
  ('research',          'أبحاث ودراسات',  'Research',          '#7d5730', 2),
  ('programs',          'برامج وأنشطة',   'Programs',          '#5a9b6e', 3),
  ('youth-policy',      'سياسات الشباب',  'Youth Policy',      '#9b6b5a', 4),
  ('success-stories',   'قصص نجاح',       'Success Stories',   '#c4872a', 5),
  ('news',              'أخبار وفعاليات', 'News & Events',     '#6b7280', 6);

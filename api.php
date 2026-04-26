<?php
/* ============================================================
   TAMMEY BLOG — api.php
   Drop this file in your website root on Cloudways.
   Edit the CONFIG section below, then run db-schema.sql once.
   ============================================================ */

// ── CONFIG (edit these 5 lines) ─────────────────────────────
define('DB_HOST',      'localhost');
define('DB_NAME',      'ndnnwpjrrz');
define('DB_USER',      'ndnnwpjrrz');
define('DB_PASS',      '4xFyRrARD5');   // ← paste from Cloudways DB details
define('ADMIN_SECRET', 'admin123');   // ← choose any password for the admin panel
define('UPLOADS_DIR',  __DIR__ . '/blog-uploads/');
define('UPLOADS_URL',  '/blog-uploads/');

// ── CORS & JSON headers ──────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Admin-Secret');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

// ── DB connection ────────────────────────────────────────────
try {
    $db = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (PDOException $e) {
    http_response_code(500);
    die(json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]));
}

// ── Helpers ──────────────────────────────────────────────────
function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function require_admin() {
    $secret = $_SERVER['HTTP_ADMIN_SECRET'] ?? $_SERVER['HTTP_X_ADMIN_SECRET'] ?? '';
    if ($secret !== ADMIN_SECRET) json_out(['error' => 'Unauthorized'], 401);
}
function get_body() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}
function slug_from($text) {
    $text = mb_strtolower(trim($text));
    $text = preg_replace('/[\s\-]+/', '-', $text);
    $text = preg_replace('/[^\p{L}\p{N}\-]/u', '', $text);
    return $text . '-' . time();
}
// Convert any date string (ISO 8601 or otherwise) → MySQL DATETIME format
function to_mysql_date($val) {
    if (empty($val)) return null;
    $ts = strtotime($val);
    return $ts ? date('Y-m-d H:i:s', $ts) : null;
}

// ── Router ───────────────────────────────────────────────────
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// ════════════════════════════════════════════════════════════
//  PUBLIC ACTIONS
// ════════════════════════════════════════════════════════════

// GET ?action=categories
if ($action === 'categories' && $method === 'GET') {
    $rows = $db->query(
        'SELECT id, slug, name_ar, name_en, color, sort_order
         FROM blog_categories ORDER BY sort_order'
    )->fetchAll();
    json_out($rows);
}

// GET ?action=posts [&page=1&limit=9&category=slug&featured=1]
if ($action === 'posts' && $method === 'GET') {
    $page     = max(1, (int)($_GET['page']  ?? 1));
    $limit    = min(50, (int)($_GET['limit'] ?? 9));
    $offset   = ($page - 1) * $limit;
    $category = $_GET['category'] ?? '';
    $featured = $_GET['featured'] ?? '';

    $where = "p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW())";
    $args  = [];

    if ($category) { $where .= ' AND c.slug = ?'; $args[] = $category; }
    if ($featured === 'true' || $featured === '1') { $where .= ' AND p.is_featured = 1'; }

    $countSt = $db->prepare("SELECT COUNT(*) FROM blog_posts p JOIN blog_categories c ON c.id = p.category_id WHERE $where");
    $countSt->execute($args);
    $total = (int)$countSt->fetchColumn();

    $st = $db->prepare(
        "SELECT p.id, p.slug, p.title_ar, p.title_en,
                p.excerpt_ar, p.excerpt_en, p.cover_image,
                p.read_time_min, p.is_featured, p.published_at,
                c.slug AS category_slug, c.name_ar AS category_ar,
                c.name_en AS category_en, c.color AS category_color,
                a.name_ar AS author_ar, a.name_en AS author_en,
                a.avatar_url AS author_avatar
         FROM blog_posts p
         JOIN blog_categories c ON c.id = p.category_id
         LEFT JOIN blog_authors a ON a.id = p.author_id
         WHERE $where
         ORDER BY p.published_at DESC
         LIMIT $limit OFFSET $offset"
    );
    $st->execute($args);
    $posts = $st->fetchAll();

    json_out([
        'total' => $total,
        'page'  => $page,
        'limit' => $limit,
        'pages' => (int)ceil($total / $limit),
        'posts' => $posts,
    ]);
}

// GET ?action=post&slug=my-slug
if ($action === 'post' && $method === 'GET') {
    $slug = $_GET['slug'] ?? '';
    if (!$slug) json_out(['error' => 'slug required'], 400);

    $st = $db->prepare(
        "SELECT p.id, p.slug, p.title_ar, p.title_en,
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
         WHERE p.slug = ? AND p.status = 'published'"
    );
    $st->execute([$slug]);
    $post = $st->fetch();
    if (!$post) json_out(['error' => 'Not found'], 404);

    $tSt = $db->prepare(
        "SELECT t.slug, t.name_ar, t.name_en
         FROM blog_tags t
         JOIN blog_post_tags pt ON pt.tag_id = t.id
         JOIN blog_posts p ON p.id = pt.post_id
         WHERE p.slug = ?"
    );
    $tSt->execute([$slug]);
    $post['tags'] = $tSt->fetchAll();

    json_out($post);
}

// ════════════════════════════════════════════════════════════
//  ADMIN ACTIONS (require Admin-Secret header)
// ════════════════════════════════════════════════════════════

// GET ?action=admin_posts
if ($action === 'admin_posts' && $method === 'GET') {
    require_admin();
    $page   = max(1, (int)($_GET['page']  ?? 1));
    $limit  = min(100, (int)($_GET['limit'] ?? 20));
    $offset = ($page - 1) * $limit;

    $st = $db->prepare(
        "SELECT p.id, p.slug, p.title_ar, p.title_en, p.status,
                p.is_featured, p.published_at, p.created_at, p.updated_at,
                c.name_ar AS category_ar, c.name_en AS category_en
         FROM blog_posts p
         JOIN blog_categories c ON c.id = p.category_id
         ORDER BY p.created_at DESC
         LIMIT $limit OFFSET $offset"
    );
    $st->execute();
    json_out($st->fetchAll());
}

// POST ?action=upload
if ($action === 'upload' && $method === 'POST') {
    require_admin();
    if (!isset($_FILES['image'])) json_out(['error' => 'No file'], 400);

    $file = $_FILES['image'];
    $allowed = ['image/jpeg','image/png','image/webp','image/gif'];
    if (!in_array($file['type'], $allowed)) json_out(['error' => 'Images only'], 400);
    if ($file['size'] > 5 * 1024 * 1024)  json_out(['error' => 'Max 5MB'],    400);

    if (!is_dir(UPLOADS_DIR)) mkdir(UPLOADS_DIR, 0755, true);
    $ext  = pathinfo($file['name'], PATHINFO_EXTENSION);
    $name = time() . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
    move_uploaded_file($file['tmp_name'], UPLOADS_DIR . $name);
    json_out(['url' => UPLOADS_URL . $name]);
}

// POST ?action=create
if ($action === 'create' && $method === 'POST') {
    require_admin();
    try {
        $b = get_body();

        if (empty($b['title_ar']) || empty($b['body_ar']) || empty($b['category_id']))
            json_out(['error' => 'title_ar, body_ar, and category_id are required'], 400);

        $status = $b['status'] ?? 'draft';
        $slug   = slug_from($b['title_ar']);

        // Convert date from JS ISO format → MySQL format
        if (!empty($b['published_at'])) {
            $pub_at = to_mysql_date($b['published_at']);
        } elseif ($status === 'published') {
            $pub_at = date('Y-m-d H:i:s');
        } else {
            $pub_at = null;
        }

        $st = $db->prepare(
            "INSERT INTO blog_posts
               (slug, category_id, author_id, title_ar, title_en,
                excerpt_ar, excerpt_en, body_ar, body_en,
                cover_image, read_time_min, is_featured, status, published_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        );
        $st->execute([
            $slug,
            (int)$b['category_id'],
            !empty($b['author_id']) ? (int)$b['author_id'] : null,
            $b['title_ar'],
            $b['title_en']      ?? null,
            $b['excerpt_ar']    ?? null,
            $b['excerpt_en']    ?? null,
            $b['body_ar'],
            $b['body_en']       ?? null,
            $b['cover_image']   ?? null,
            (int)($b['read_time_min'] ?? 5),
            !empty($b['is_featured']) ? 1 : 0,
            $status,
            $pub_at,
        ]);
        $newId = $db->lastInsertId();

        foreach (($b['tags'] ?? []) as $tagId) {
            $db->prepare('INSERT IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?,?)')
               ->execute([$newId, (int)$tagId]);
        }
        json_out(['id' => (int)$newId, 'slug' => $slug], 201);
    } catch (Exception $e) {
        json_out(['error' => 'Create failed: ' . $e->getMessage()], 500);
    }
}

// PUT ?action=update&id=X
if ($action === 'update' && $method === 'PUT') {
    require_admin();
    try {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) json_out(['error' => 'id required'], 400);
        $b = get_body();

        $status = $b['status'] ?? 'draft';
        if (!empty($b['published_at'])) {
            $pub_at = to_mysql_date($b['published_at']);
        } elseif ($status === 'published') {
            $pub_at = date('Y-m-d H:i:s');
        } else {
            $pub_at = null;
        }

        $db->prepare(
            "UPDATE blog_posts SET
               category_id=?, author_id=?, title_ar=?, title_en=?,
               excerpt_ar=?, excerpt_en=?, body_ar=?, body_en=?,
               cover_image=?, read_time_min=?, is_featured=?, status=?, published_at=?
             WHERE id=?"
        )->execute([
            (int)$b['category_id'],
            !empty($b['author_id']) ? (int)$b['author_id'] : null,
            $b['title_ar'],
            $b['title_en']      ?? null,
            $b['excerpt_ar']    ?? null,
            $b['excerpt_en']    ?? null,
            $b['body_ar'],
            $b['body_en']       ?? null,
            $b['cover_image']   ?? null,
            (int)($b['read_time_min'] ?? 5),
            !empty($b['is_featured']) ? 1 : 0,
            $status,
            $pub_at,
            $id,
        ]);

        if (isset($b['tags']) && is_array($b['tags'])) {
            $db->prepare('DELETE FROM blog_post_tags WHERE post_id=?')->execute([$id]);
            foreach ($b['tags'] as $tagId) {
                $db->prepare('INSERT IGNORE INTO blog_post_tags (post_id,tag_id) VALUES (?,?)')
                   ->execute([$id, (int)$tagId]);
            }
        }
        json_out(['ok' => true]);
    } catch (Exception $e) {
        json_out(['error' => 'Update failed: ' . $e->getMessage()], 500);
    }
}

// PATCH ?action=publish&id=X
if ($action === 'publish' && $method === 'PATCH') {
    require_admin();
    try {
        $id      = (int)($_GET['id'] ?? 0);
        $b       = get_body();
        $publish = !empty($b['publish']);
        $db->prepare('UPDATE blog_posts SET status=?, published_at=? WHERE id=?')
           ->execute([$publish ? 'published' : 'draft', $publish ? date('Y-m-d H:i:s') : null, $id]);
        json_out(['ok' => true]);
    } catch (Exception $e) {
        json_out(['error' => $e->getMessage()], 500);
    }
}

// DELETE ?action=delete&id=X
if ($action === 'delete' && $method === 'DELETE') {
    require_admin();
    try {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) json_out(['error' => 'id required'], 400);
        $db->prepare('DELETE FROM blog_posts WHERE id=?')->execute([$id]);
        json_out(['ok' => true]);
    } catch (Exception $e) {
        json_out(['error' => $e->getMessage()], 500);
    }
}

// Fallback
json_out(['error' => 'Unknown action'], 404);
                              
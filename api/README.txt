TAMMEY BLOG API — SETUP GUIDE
==============================

REQUIREMENTS:
  - Node.js v18+ (https://nodejs.org)
  - SQL Server (any version) with a database created

STEPS:
  1. Open a terminal inside this "api" folder.

  2. Install dependencies:
       npm install

  3. Copy .env.example to .env and fill in your SQL Server details:
       cp .env.example .env
       (then edit .env with your server, database, user, password)

  4. Run the DB schema ONCE on your SQL Server:
       Open db-schema.sql in SSMS (SQL Server Management Studio)
       and execute it on your database.

  5. Start the API server:
       npm start
       (or for development with auto-reload: npm run dev)

  6. The API will be available at: http://localhost:3001

  7. Open your website's blog at:
       blog.html  ← lists all published posts
       blog-post.html?slug=my-slug  ← individual post
       admin/index.html  ← admin dashboard to write/manage posts

PRODUCTION NOTE:
  - Change API_BASE in blog.html, blog-post.html, and admin/index.html
    from "http://localhost:3001/api" to your real server URL.
  - Set ADMIN_SECRET in .env to a long, random string.
  - Keep .env out of version control (add to .gitignore).

# WordPress Website Migration & Recovery Procedure

> **Part of the All Elite Cloud Operations Manual.**
> Standard Operating Procedure for the All Elite Cloud / All Elite Hosting platform (powered by Faith Harbor OS).

This document is the authoritative, repeatable procedure for **migrating, restoring, cloning, and recovering WordPress websites** on cPanel-based hosting while minimizing downtime and preventing data loss.

It is written to serve two audiences at once:

- **New technicians** — as a training resource that explains not just *what* to do, but *why*.
- **Experienced technicians** — as a fast operational reference with copy-paste commands and checklists.

> **Note:** Throughout this document, replace placeholders such as `example.com`, `USERNAME`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` with the real values for the account you are working on. Never paste real client credentials into shared documents, tickets, or chat.

---

## Table of Contents

1. [Document Purpose](#1-document-purpose)
2. [Scope](#2-scope)
3. [Prerequisites](#3-prerequisites)
4. [Required Access](#4-required-access)
5. [Safety Checklist](#5-safety-checklist)
6. [Step-by-Step Procedures](#6-step-by-step-procedures)
7. [Troubleshooting](#7-troubleshooting)
8. [Common Errors](#8-common-errors)
9. [Verification Checklist](#9-verification-checklist)
10. [Recovery Procedures](#10-recovery-procedures)
11. [Best Practices](#11-best-practices)
12. [Internal Checklists](#12-internal-checklists)
13. [Integration](#13-integration)
14. [Revision History](#14-revision-history)

---

## 1. Document Purpose

The purpose of this SOP is to provide a **single, consistent, low-risk method** for handling any WordPress website move or repair on All Elite Cloud / All Elite Hosting infrastructure. Following this procedure ensures that:

- Every migration begins with a verified backup.
- Downtime is minimized and predictable.
- No client ever loses data because of an avoidable mistake.
- Any technician — regardless of experience — can perform or hand off the work without ambiguity.
- Every action is documented and auditable.

> **Note:** When in doubt, **stop and back up.** A migration that takes an extra 15 minutes is always cheaper than a data-loss incident.

---

## 2. Scope

This procedure applies to:

- **Migrations** — moving a WordPress site between hosting accounts, servers, or domains.
- **Clones / copies** — duplicating a site into a subdomain, staging area, or new account.
- **Restores** — recovering a site from a backup after failure, compromise, or human error.
- **Recovery** — repairing a broken but still-present site (500 errors, White Screen of Death, broken permalinks, SSL issues, etc.).
- **Domain changes** — pointing an existing site to a new domain name.
- **Hosting transfers** — inbound and outbound account moves.

**Out of scope:** Non-WordPress application migrations, custom database platforms, and DNS registrar-level administration beyond record changes. For platform (Faith Harbor OS engine) deployment, see the cross-referenced deployment docs in [Section 13](#13-integration).

---

## 3. Prerequisites

Before starting any procedure in this document, confirm the following are in place:

- [ ] A **support ticket or work order** exists describing the requested change.
- [ ] The **maintenance window** (if any) is agreed with the client.
- [ ] You have a **local scratch/working directory** with adequate free disk space (at least 2× the site size).
- [ ] You know the **source** and **destination** details (domain, cPanel user, document root).
- [ ] You have reviewed this SOP's [Safety Checklist](#5-safety-checklist).
- [ ] You have a rollback plan (which backup to restore, and how).

**Tools you should have available:**

| Tool | Where | Used for |
|---|---|---|
| cPanel (jailed) | `https://server.example.com:2083` | File Manager, backups, databases, SSL |
| WP Toolkit | cPanel → **WP Toolkit** | Clone, backup, URL replace, security scan |
| Softaculous | cPanel → **Softaculous Apps Installer** | Backup/restore, staging clones |
| phpMyAdmin | cPanel → **phpMyAdmin** | Database export/import/repair |
| SSH / Terminal | Port 2222 (or account-specific) | `wp-cli`, `tar`, `mysqldump` |
| WP-CLI | On the server (`wp`) | Search-replace, db repair, plugin/theme control |

> **Tip:** Verify WP-CLI is available on the server before you rely on it: `wp --info`. If it is not installed globally, download the phar to the account: `curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar` and call it as `./wp-cli.phar`.

---

## 4. Required Access

Confirm you hold the appropriate access **before** beginning. Do not start a migration you cannot finish or roll back.

| Access | Needed for | Notes |
|---|---|---|
| cPanel login (source) | Backups, exports, file access | Jailed cPanel is sufficient for most work |
| cPanel login (destination) | Restore, import, subdomain creation | May be the same account for a clone |
| SSH key / credentials | WP-CLI, tar, mysqldump | Preferred for large sites |
| WHM / root (where applicable) | AutoSSL re-issue, account creation, PHP version | Escalate to a senior tech if you lack this |
| Domain registrar / DNS | Final cutover, nameservers, A records | Coordinate — DNS is the last step |
| WordPress admin | Permalinks flush, plugin/theme checks | Reset password via phpMyAdmin if needed |

> **Caution:** Never request or store the client's registrar password in plain text. Use the registrar's delegated-access or DNS-only sharing where possible.

---

## 5. Safety Checklist

Complete this checklist **before touching any files or database**. This is the single most important section of the document.

- [ ] A **fresh, verified backup** of the source site (files **and** database) exists and has been downloaded off-server.
- [ ] The backup has been **test-listed** (`tar tzf backup.tar.gz | head`) or opened to confirm it is not empty/corrupt.
- [ ] You have recorded the current **PHP version, WordPress version, plugin versions, theme version**.
- [ ] You have recorded **DNS records, SSL status, and database credentials**.
- [ ] You are working on a **subdomain or staging copy first** whenever the change is non-trivial.
- [ ] You have **not** deleted or overwritten the only working copy of anything.
- [ ] You know exactly **how to roll back** and how long it will take.
- [ ] The client/ticket owner knows the **expected downtime window**.

> **Caution:** If any box above cannot be checked, **do not proceed.** Resolve the gap or escalate first.

---

## 6. Step-by-Step Procedures

### 6.1 Pre-Migration Checklist

Gather and **record** all of the following into the ticket before making changes. This snapshot is your reference for verification and rollback.

1. **Verify current backups exist.**
   - cPanel → **JetBackup / Backup** — confirm the last automated backup date.
   - WP Toolkit → select site → **Backup/Restore** — confirm a recent restore point.
   - > **Caution:** An automated backup that you have never restored from is *unverified*. Always create your own fresh backup (Section 6.2) rather than trusting an untested one.

2. **Export the database** (see Section 6.2 for methods). Save as `DB_NAME_YYYYMMDD.sql`.

3. **Back up website files** (see Section 6.2). Save as `USERNAME_files_YYYYMMDD.tar.gz`.

4. **Record the PHP version.**
   - cPanel → **Select PHP Version** (MultiPHP Manager), **or**
   - `php -v` over SSH, **or**
   - `wp eval 'echo PHP_VERSION;'`

5. **Record the WordPress version.**
   - Dashboard → **Updates**, **or** `wp core version`.

6. **Record plugin versions.**
   - `wp plugin list --fields=name,status,version` (save the full output to the ticket).

7. **Record the theme version.**
   - `wp theme list --fields=name,status,version`.

8. **Record DNS information.**
   - Registrar/DNS zone: A / AAAA records, CNAMEs, MX, TXT (SPF/DKIM/DMARC), nameservers.
   - Command line: `dig example.com +noall +answer` and `dig www.example.com +noall +answer`.
   - Note the current **TTL** — lowering TTL 24–48h before a cutover reduces propagation delay.

9. **Record SSL status.**
   - cPanel → **SSL/TLS Status** — note issuer, expiry, and whether AutoSSL covers all hostnames.
   - `echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null | openssl x509 -noout -dates -issuer`.

10. **Record database credentials.**
    - From `wp-config.php`: `DB_NAME`, `DB_USER`, `DB_HOST`, `$table_prefix`.
    - > **Note:** Record these in the secure ticket vault only — never in chat or a shared doc.

> **Tip:** Keep this recorded snapshot at the top of the ticket. During verification you will compare the migrated site against it line by line.

---

### 6.2 Creating a Safe Backup

You need **both** the files and the database. Use whichever method fits the situation; when possible, keep a redundant copy from a second method.

> **Caution — Files vs. Database:** A WordPress site is **files + a database**, always. The database holds posts, pages, settings, users, and most plugin data; the files hold themes, plugins, uploads, and `wp-config.php`. **Backing up files only (or database only) is not a backup.** Restoring from half a backup will produce a broken or empty site. Every backup task in this SOP means *both* unless explicitly stated.

#### Method A — WP Toolkit

1. cPanel → **WP Toolkit** → select the site.
2. Click **Backup/Restore** → **Back Up**.
3. Wait for completion; confirm the new restore point appears with today's date.
4. Optionally **Download** the backup archive off-server.

#### Method B — Softaculous

1. cPanel → **Softaculous Apps Installer** → **All Installations** (the wrench icon lists sites).
2. Select the WordPress install → **Backup**.
3. Choose to back up **Directory + Database** (both).
4. Download the resulting archive from **Backups** → download icon.

#### Method C — cPanel File Manager (files)

1. cPanel → **File Manager** → navigate to the document root (e.g. `public_html`).
2. Select the site folder (or all site files) → **Compress** → **Gzipped Tar Archive**.
3. Download the resulting `.tar.gz`.
4. > **Note:** File Manager compresses files only — pair it with Method D for the database.

#### Method D — phpMyAdmin (database export)

1. cPanel → **phpMyAdmin** → select `DB_NAME` in the left tree.
2. Click **Export** → **Custom**.
3. Format: **SQL**. Under **Object creation options**, enable **Add DROP TABLE / VIEW / PROCEDURE** (makes re-import idempotent).
4. Compression: **gzipped** for large databases.
5. Click **Export** and save `DB_NAME_YYYYMMDD.sql.gz`.
6. > **Tip:** For very large databases phpMyAdmin may time out — use Method E (mysqldump) instead.

#### Method E — Manual SSH backup (tar + mysqldump)

Preferred for large sites and for scripted, repeatable backups.

```bash
# 1) Move to the account's document root
cd ~/public_html            # adjust to the real doc root

# 2) Back up ALL files (including .htaccess and wp-config.php)
tar czvf ~/USERNAME_files_$(date +%F).tar.gz .

# 3) Read DB credentials straight from wp-config.php if unsure
grep -E "DB_NAME|DB_USER|DB_PASSWORD|DB_HOST" wp-config.php

# 4) Dump the database (you will be prompted for the password)
mysqldump --single-transaction --quick --routines --triggers \
  -u DB_USER -p DB_NAME > ~/DB_NAME_$(date +%F).sql

# 5) Verify the dump is non-empty and complete
tail -n 5 ~/DB_NAME_$(date +%F).sql     # should end with "-- Dump completed"
ls -lh ~/USERNAME_files_*.tar.gz ~/DB_NAME_*.sql
```

> **Tip:** With WP-CLI you can dump the database without typing credentials: `wp db export ~/DB_NAME_$(date +%F).sql`. This automatically reads the connection details from `wp-config.php`.

#### Method F — Full cPanel account backup

1. cPanel → **Backup** → **Download a Full Account Backup**.
2. Choose destination **Home Directory** and submit.
3. When the email/notification confirms completion, download the `.tar.gz` from the home directory.
4. > **Note:** A full account backup includes files, all databases, email, and cron jobs — ideal for a full hosting transfer, but large. Do not rely on it as your *only* copy of a single site's database; also keep a standalone SQL export.

**After any backup, always verify:**

```bash
tar tzf ~/USERNAME_files_$(date +%F).tar.gz | head        # lists files -> archive is readable
gzip -t ~/DB_NAME_$(date +%F).sql.gz && echo "gzip OK"    # tests integrity if compressed
```

---

### 6.3 Copying a WordPress Site (Clone)

#### Method A — WP Toolkit Clone (recommended)

1. cPanel → **WP Toolkit** → select the source site → **Clone**.
2. Choose the **destination**: an existing subdomain, a new subdomain, or a new path.
3. WP Toolkit creates a new database, copies files, and rewrites URLs automatically.
4. Wait for completion, then open the clone URL and log in to verify.

> **Tip:** WP Toolkit clone is the safest copy method because it handles the database URL replacement (serialized-safe) for you. Prefer it unless you have a reason not to.

#### Method B — Manual clone

1. **Create a new subdomain** (see 6.3.1).
2. **Copy files** into the new document root (see 6.3.2).
3. **Create a new database + user** and **import** the SQL (see 6.3.3).
4. **Update `wp-config.php`** for the new DB (see 6.3.4).
5. **Fix URLs** (Section 6.4).
6. **Verify permissions** (see 6.3.5).

##### 6.3.1 Create a new subdomain

1. cPanel → **Domains** (or **Subdomains**) → **Create A New Domain / Subdomain**.
2. Enter e.g. `staging.example.com`. Note the document root cPanel assigns (e.g. `~/staging.example.com`).
3. Confirm the subdomain resolves (it may need a few minutes and AutoSSL).

##### 6.3.2 Copy files

```bash
# Over SSH, copy source files into the new doc root
cp -a ~/public_html/. ~/staging.example.com/
# -a preserves permissions, ownership, and timestamps (including dotfiles like .htaccess)
```

##### 6.3.3 Create the database and import

```bash
# Create DB + user in cPanel -> MySQL Databases, then:
mysql -u NEW_DB_USER -p NEW_DB_NAME < ~/DB_NAME_$(date +%F).sql
# or with WP-CLI from inside the new doc root after wp-config is set:
# wp db import ~/DB_NAME_$(date +%F).sql
```

> **Caution:** Grant the new DB user **ALL PRIVILEGES** on the new database in cPanel → **MySQL Databases** → *Add User To Database*. A missing grant produces an "Error establishing a database connection".

##### 6.3.4 Update `wp-config.php`

Edit the clone's `wp-config.php` and set:

```php
define( 'DB_NAME', 'NEW_DB_NAME' );
define( 'DB_USER', 'NEW_DB_USER' );
define( 'DB_PASSWORD', 'NEW_DB_PASSWORD' );
define( 'DB_HOST', 'localhost' );      // almost always 'localhost' on cPanel

$table_prefix = 'wp_';                 // MUST match the prefix used in the imported database
```

> **Caution:** The `$table_prefix` in `wp-config.php` **must** match the actual table prefix in the imported database (e.g. `wp_`, `wpxy_`). A mismatch yields a blank site or a fresh install screen even though the data is present.

> **Tip:** For a true independent clone, also regenerate the **security keys/salts** (the `AUTH_KEY` … `NONCE_SALT` block). Generate a fresh set at `https://api.wordpress.org/secret-key/1.1/salt/` and paste them in. This logs out existing sessions but isolates the clone's cookies from the original.

##### 6.3.5 Verify file and folder permissions

```bash
cd ~/staging.example.com
find . -type d -exec chmod 755 {} \;   # directories: 755
find . -type f -exec chmod 644 {} \;   # files: 644
chmod 640 wp-config.php                # wp-config: 600 or 640 (not world-readable)
```

| Target | Permission |
|---|---|
| Directories | `755` |
| Files | `644` |
| `wp-config.php` | `600` or `640` |

> **Caution:** Never set `777` on any WordPress file or directory. It is a security risk and many hosts (LiteSpeed/suPHP) will refuse to execute `777` scripts.

---

### 6.4 Updating URLs

When a site moves to a new domain or subdomain, the old URL is stored in many database rows and must be replaced correctly.

**WordPress Address vs. Site Address:**

- **WordPress Address (URL)** — where the WordPress core files live (`siteurl`).
- **Site Address (URL)** — the public address visitors use (`home`).
- Both are in **Settings → General**, and are stored in the `wp_options` table as `siteurl` and `home`.

> **Caution — Serialized data:** WordPress stores much of its data (widget settings, theme options, many plugin settings) as **PHP-serialized strings** that embed the *byte length* of each value. A naive SQL `UPDATE ... REPLACE(...)` changes the text but **not** the recorded length, corrupting the serialized data and breaking widgets, theme options, and plugins. **Never** run a plain SQL find/replace across the whole database for URL changes.

**Use a serialization-aware tool instead:**

#### Method A — WP-CLI `search-replace` (preferred)

```bash
# Dry run first — shows how many replacements WOULD happen, changes nothing
wp search-replace 'https://old-example.com' 'https://new-example.com' --all-tables --dry-run

# Real run (serialization-safe), skipping the GUID column per WP guidance
wp search-replace 'https://old-example.com' 'https://new-example.com' \
  --all-tables --skip-columns=guid --report-changed-only

# Also catch protocol-relative and non-www variants if they exist
wp search-replace 'http://old-example.com'  'https://new-example.com' --all-tables --skip-columns=guid
```

> **Tip:** Always run with `--dry-run` first. The `guid` column must **not** be changed for existing posts — it is a permanent identifier for feed readers, not a link. That is why we `--skip-columns=guid`.

#### Method B — WP Toolkit URL replacement

1. WP Toolkit → select site → **Tools / Search and Replace** (or it runs automatically during Clone).
2. Enter the old and new URLs.
3. WP Toolkit performs a serialization-safe replacement across the database.

#### Method C — Set core URLs quickly (if login is blocked)

```bash
wp option update home    'https://new-example.com'
wp option update siteurl 'https://new-example.com'
```

Or define them temporarily in `wp-config.php`:

```php
define( 'WP_HOME',    'https://new-example.com' );
define( 'WP_SITEURL', 'https://new-example.com' );
```

> **Note:** After defining these constants, you can log in and complete a full `search-replace`, then remove the constants so the values live in the database again.

---

### 6.5 Fixing Broken Pages (404 on internal pages)

**Symptom:** The homepage loads, but internal pages/posts return **404 Not Found**. This is almost always stale rewrite rules after a move.

**Exact recovery steps:**

1. **Log in** to WordPress admin (`https://example.com/wp-admin`).
2. Go to **Settings → Permalinks**.
3. **Do not change any setting.** Simply click **Save Changes**.
4. **Verify** that internal pages and posts now load.

**Why this works:** Clicking *Save Changes* on the Permalinks screen forces WordPress to **flush and rebuild its rewrite rules** and, when the `.htaccess` file is writable, to **regenerate the WordPress rewrite block** inside it. After a migration the old rewrite rules or `.htaccess` no longer match the new environment, so pages 404 until the rules are rebuilt.

> **Tip:** From the command line the same flush is: `wp rewrite flush --hard`. The `--hard` flag also rewrites the `.htaccess` rules.

---

### 6.6 `.htaccess` Recovery

If saving permalinks does not fix 404s, the `.htaccess` file may be missing, corrupt, or not writable.

1. cPanel → **File Manager** → enable **Settings → Show Hidden Files (dotfiles)**.
2. In the document root, **rename** the existing file to `.htaccess.old` (never delete the only copy).
3. Go to **Settings → Permalinks → Save Changes** to regenerate a fresh `.htaccess`.
4. If WordPress cannot write the file, create a new `.htaccess` manually with the canonical block below.
5. Confirm the file contains `RewriteEngine On`.

**Canonical WordPress `.htaccess` block:**

```apache
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
```

> **Caution:** Only the content **between** `# BEGIN WordPress` and `# END WordPress` is managed by WordPress. If the site had custom rules (caching, redirects, security), preserve them from `.htaccess.old` by copying them **outside** the WordPress block.

> **Note:** For a site in a subdirectory, adjust `RewriteBase /subdir/` and `RewriteRule . /subdir/index.php [L]` accordingly.

---

### 6.7 SSL Verification

After a move, confirm the site is served securely with no mixed content.

1. **HTTPS redirect** — visiting `http://example.com` should 301-redirect to `https://`. Confirm the redirect exists (via a plugin like Really Simple SSL, LiteSpeed, or an `.htaccess` rule) and that `home`/`siteurl` use `https://`.
2. **Mixed content** — open the site, then browser **DevTools → Console**; look for "Mixed Content" warnings (assets loaded over `http://`). Fix by running `wp search-replace 'http://example.com' 'https://example.com'` and updating hard-coded asset URLs in the theme.
3. **AutoSSL re-issue (cPanel):**
   - cPanel → **SSL/TLS Status** → select the domain(s) → **Run AutoSSL**.
   - If it fails, ensure DNS points to this server and that `/.well-known/acme-challenge/` is reachable (not blocked by `.htaccess` or a redirect).
4. **Certificate expiration** — check the **Expires** column in SSL/TLS Status; AutoSSL renews ~automatically but verify after a domain change.
5. **Browser verification** — load the site, confirm the **padlock** icon, and inspect certificate details (issuer, validity dates, covered hostnames).

```bash
# Quick CLI certificate check
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

> **Caution:** After a **domain change**, AutoSSL for the *new* domain only issues once DNS resolves to this server. Plan SSL re-issue as part of, not before, the DNS cutover.

---

### 6.8 Cache Clearing

Stale caches are the number-one cause of "I made the change but nothing updated." Purge caches **from the origin outward** in this order:

1. **Object cache (Redis/Memcached)** — closest to the database.
2. **Application/plugin cache** (WordPress cache plugin).
3. **Server cache** (LiteSpeed Cache / WP Toolkit cache).
4. **CDN cache** (Cloudflare or other CDN).
5. **Browser cache** (yours, for testing).

**How to purge each layer:**

- **Browser cache** — hard reload (`Ctrl+F5` / `Cmd+Shift+R`) or test in a private/incognito window.
- **WP Toolkit cache** — WP Toolkit → site → **Cache** → **Flush** (or toggle off/on).
- **WordPress cache plugins** — from the plugin's toolbar/menu: *Purge All* (W3 Total Cache, WP Super Cache, WP Rocket, etc.). CLI: `wp cache flush`.
- **Redis** —
  ```bash
  wp redis flush          # WordPress object cache only (safe, preferred)
  # redis-cli FLUSHALL     # DANGER: wipes ALL keys for ALL databases on the Redis server
  ```
  > **Caution:** `redis-cli FLUSHALL` clears **every** database on the Redis instance — potentially affecting other sites/tenants sharing it. Prefer `wp redis flush` (or `FLUSHDB` scoped to the correct DB index). Only use `FLUSHALL` on a dedicated, single-tenant Redis and only when you understand the blast radius.
- **LiteSpeed Cache** — WordPress admin → **LiteSpeed Cache → Toolbox → Purge All**, or WP-CLI `wp litespeed-purge all`.
- **Cloudflare** — dashboard → **Caching → Configuration → Purge Everything** (or purge by URL). API/CLI possible with the zone token.
- **CDN cache** — purge from the CDN provider's dashboard/API after origin caches are cleared.

> **Tip:** If a change still will not show after purging every layer, confirm you are editing the right site (staging vs. production) and the right domain (www vs. non-www).

---

### 6.9 Post-Migration Verification Checklist

Walk the migrated site against the pre-migration snapshot. Check each item:

- [ ] **Homepage** loads correctly (layout, hero, no errors).
- [ ] **Internal pages** load (no 404s — see 6.5 if they fail).
- [ ] **Posts** load and display correctly.
- [ ] **Images** render (no broken thumbnails; check `wp-content/uploads`).
- [ ] **Menus** display and links resolve.
- [ ] **Forms** render.
- [ ] **Contact forms** actually submit and deliver.
- [ ] **Search** returns results.
- [ ] **Login** works (front-end and `/wp-admin`).
- [ ] **Admin dashboard** loads with no fatal errors/notices.
- [ ] **Plugin functionality** — spot-check each critical plugin.
- [ ] **WooCommerce** (if applicable) — products, cart, checkout, payment gateway in test mode.
- [ ] **Email sending** — password reset / contact form / order emails arrive (check SPF/DKIM).
- [ ] **SSL** — padlock present, no mixed-content warnings, HTTPS redirect works.
- [ ] **Mobile responsiveness** — check on a phone or DevTools device mode.
- [ ] **Performance** — homepage TTFB and load time are reasonable; caching active.
- [ ] **Security** — no default admin creds, file permissions correct, WP Toolkit security scan clean.

> **Note:** Keep this completed checklist in the ticket as the record of a successful migration.

---

## 7. Troubleshooting

Quick diagnostic reference. For full step-by-step fixes see [Section 10, Recovery Procedures](#10-recovery-procedures).

| Symptom | First things to check |
|---|---|
| Blank white page | PHP fatal error — enable `WP_DEBUG`, check `error_log`, deactivate plugins |
| "Error establishing a database connection" | `wp-config.php` DB creds, DB user grants, `DB_HOST`, DB server up |
| Internal Server Error (500) | `.htaccess` syntax, PHP memory limit, corrupt plugin/theme, file permissions |
| 404 on internal pages | Flush permalinks (6.5); regenerate `.htaccess` (6.6) |
| Broken/missing images | `wp-content/uploads` copied? URLs updated? file permissions? |
| Redirect loop | `home`/`siteurl` mismatch, duplicate HTTPS redirects, Cloudflare SSL mode |
| Old URLs still appearing | Incomplete `search-replace`; cache not purged (6.8) |
| Changes not showing | Cache layers not purged in order (6.8); editing wrong site |
| Styling missing | Mixed content blocked; theme asset URLs still `http://`; cache |

> **Tip:** Turn on debugging temporarily to see the real error:
> ```php
> // wp-config.php (remove after diagnosing)
> define( 'WP_DEBUG', true );
> define( 'WP_DEBUG_LOG', true );      // writes to wp-content/debug.log
> define( 'WP_DEBUG_DISPLAY', false ); // don't show errors to visitors
> ```

---

## 8. Common Errors

| Error | Cause | Resolution |
|---|---|---|
| `Error establishing a database connection` | Wrong DB name/user/password/host in `wp-config.php`, or user lacks grants | Correct credentials; add user to DB with ALL PRIVILEGES; confirm `DB_HOST=localhost` |
| White Screen of Death | PHP fatal error (plugin/theme/memory) | Enable debug log; deactivate all plugins; switch to default theme; raise memory limit |
| `500 Internal Server Error` | Bad `.htaccess`, low PHP memory, corrupt core/plugin | Rename `.htaccess` and regenerate (6.6); increase memory; reinstall core |
| Pages 404 after move | Stale rewrite rules / missing `.htaccess` | Save Permalinks (6.5); regenerate `.htaccess` (6.6) |
| Redirect loop (`ERR_TOO_MANY_REDIRECTS`) | `home`/`siteurl` mismatch or double HTTPS redirect | Align `home`/`siteurl`; remove duplicate redirect; set Cloudflare SSL to **Full (strict)** |
| Broken serialized data | Naive SQL find/replace on serialized values | Restore DB from backup; redo with `wp search-replace` (6.4) |
| Mixed content warnings | Assets referenced over `http://` | `wp search-replace http:// https://`; fix hard-coded theme URLs |
| Missing images | Uploads not copied or wrong permissions/URLs | Re-copy `wp-content/uploads`; fix perms (755/644); update URLs |
| "One or more database tables are unavailable" | Corrupt tables | `wp db repair` or phpMyAdmin → Repair table (10.11) |
| Login redirects back to login | Cookie/domain or salt mismatch; caching login page | Regenerate salts; exclude `/wp-admin` and `/wp-login.php` from cache |
| Fatal: unsupported PHP function/version | Site on newer PHP than plugins/theme support | Match PHP version to the source (6.1 #4); update plugins/theme |

---

## 9. Verification Checklist

A final gate before you call the migration complete and before any DNS change is made permanent:

- [ ] Pre-migration snapshot recorded (PHP, WP, plugins, theme, DNS, SSL, DB) — Section 6.1.
- [ ] Fresh, verified backup of the **source** stored off-server.
- [ ] Destination site loads on its temporary URL (subdomain/hosts-file/staging).
- [ ] URLs replaced with `wp search-replace` (serialization-safe) — no old URLs remain.
- [ ] Permalinks flushed / `.htaccess` valid (`RewriteEngine On` present).
- [ ] SSL valid on the destination (padlock, no mixed content).
- [ ] All caches purged in the correct order.
- [ ] [Post-Migration Verification Checklist](#69-post-migration-verification-checklist) fully completed.
- [ ] Rollback path still available (source untouched or backed up).
- [ ] DNS change made **only after** all of the above pass.
- [ ] Fresh backup of the **successfully migrated** site created (Section 11).
- [ ] Migration documented in the ticket; client notified.

---

## 10. Recovery Procedures

For each scenario: **symptom → likely causes → fix steps.** These apply whether the failure occurred during a migration or on a live site.

### 10.1 White Screen of Death (WSOD)

- **Symptom:** Completely blank page, no error text.
- **Likely causes:** PHP fatal error from a plugin/theme, exhausted memory, corrupt core file.
- **Fix:**
  1. Enable debug logging (Section 7 tip) and reload to capture the fatal error from `wp-content/debug.log`.
  2. Deactivate all plugins: `wp plugin deactivate --all` (or rename `wp-content/plugins` to `plugins.off`). If the site returns, reactivate one at a time to find the culprit.
  3. Switch to a default theme: `wp theme activate twentytwentyfour`.
  4. Raise memory: add `define( 'WP_MEMORY_LIMIT', '256M' );` to `wp-config.php`.
  5. Reinstall core if a file is corrupt: `wp core download --force`.

### 10.2 Database Connection Errors

- **Symptom:** "Error establishing a database connection."
- **Likely causes:** Wrong DB credentials, missing user grants, wrong `DB_HOST`, DB service down, corrupt tables.
- **Fix:**
  1. Verify `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` in `wp-config.php` against cPanel → MySQL Databases.
  2. Confirm the DB user is **added to** the database with ALL PRIVILEGES.
  3. Test the login: `mysql -u DB_USER -p DB_NAME -e "SHOW TABLES;"`.
  4. If credentials are correct but it still fails, check for corrupt tables (10.11).
  5. On shared cPanel, `DB_HOST` is almost always `localhost`.

### 10.3 Internal Server Error (500)

- **Symptom:** Generic 500 page.
- **Likely causes:** Malformed `.htaccess`, PHP memory exhaustion, corrupt plugin/theme, bad file permissions.
- **Fix:**
  1. Rename `.htaccess` → `.htaccess.old`; retest. If fixed, regenerate via Permalinks (6.6).
  2. Increase PHP memory (`WP_MEMORY_LIMIT`) and check the PHP `error_log` in the doc root.
  3. Deactivate plugins / switch theme (as in 10.1).
  4. Fix permissions: dirs 755, files 644 (6.3.5).
  5. Check the server error log: `tail -50 ~/logs/error_log` or cPanel → **Errors**.

### 10.4 Missing Images

- **Symptom:** Broken image icons; media library thumbnails missing.
- **Likely causes:** `wp-content/uploads` not migrated, wrong permissions, un-replaced URLs, missing image sizes.
- **Fix:**
  1. Confirm `wp-content/uploads` exists on the destination and is populated.
  2. Fix permissions (755 dirs / 644 files).
  3. Update URLs with `wp search-replace` (6.4).
  4. Regenerate thumbnails: `wp media regenerate --yes` (requires the Regenerate Thumbnails plugin or WP-CLI media command).

### 10.5 Redirect Loops

- **Symptom:** Browser shows `ERR_TOO_MANY_REDIRECTS`.
- **Likely causes:** `home`/`siteurl` mismatch, duplicate HTTPS redirect rules, Cloudflare "Flexible" SSL with an origin HTTPS redirect.
- **Fix:**
  1. Verify `home` and `siteurl` both use the same scheme+host: `wp option get home` / `wp option get siteurl`.
  2. Remove duplicate redirect rules (one HTTPS redirect only — either `.htaccess`, plugin, or Cloudflare, not several).
  3. If behind Cloudflare, set SSL/TLS mode to **Full (strict)**, not Flexible.

### 10.6 Incorrect URLs

- **Symptom:** Links point to the old domain, or the site tries to load from the wrong URL.
- **Likely causes:** Incomplete/omitted URL replacement after a move.
- **Fix:**
  1. Set core URLs: `wp option update home 'https://example.com'` and `wp option update siteurl 'https://example.com'`.
  2. Run a full serialization-safe replace: `wp search-replace 'https://old' 'https://new' --all-tables --skip-columns=guid`.
  3. Purge caches (6.8).

### 10.7 Broken Plugins

- **Symptom:** A feature stops working, or the admin shows a plugin fatal error.
- **Likely causes:** PHP version mismatch, incomplete files, plugin needs its own migration/license re-activation.
- **Fix:**
  1. Identify the plugin from `debug.log`.
  2. Deactivate it: `wp plugin deactivate PLUGIN`.
  3. Reinstall clean: `wp plugin install PLUGIN --force`.
  4. Reactivate and reconfigure/relicense as needed.

### 10.8 Theme Failures

- **Symptom:** Site unstyled or theme errors on load.
- **Likely causes:** Missing theme files, PHP incompatibility, child theme missing its parent.
- **Fix:**
  1. Confirm both parent and child themes are present in `wp-content/themes`.
  2. Temporarily activate a default theme: `wp theme activate twentytwentyfour` to confirm the site otherwise works.
  3. Reinstall the theme and reactivate; re-import theme options if the plugin stores them separately.

### 10.9 Missing Uploads

- **Symptom:** Media library empty or files 404 even though thumbnails existed before.
- **Likely causes:** `wp-content/uploads` skipped by the copy (large directory), permissions, ownership.
- **Fix:**
  1. Re-sync just the uploads directory:
     ```bash
     rsync -a ~/source_uploads/ ~/public_html/wp-content/uploads/
     ```
  2. Fix permissions and ownership; confirm the web user can read the files.

### 10.10 PHP Version Mismatch

- **Symptom:** Fatal errors mentioning unsupported syntax/functions after a move to a different server.
- **Likely causes:** Destination PHP is newer/older than the site's plugins/theme support.
- **Fix:**
  1. Compare with the recorded source PHP version (6.1 #4).
  2. cPanel → **Select PHP Version / MultiPHP Manager** → set the domain to the matching version.
  3. Then update plugins/theme/core so you can safely move to a supported, current PHP version.

### 10.11 Database Corruption

- **Symptom:** "One or more database tables are unavailable," partial content, or repair prompts.
- **Likely causes:** Interrupted import, crashed MySQL, disk full.
- **Fix:**
  1. **Back up the current (broken) database first** — never repair the only copy.
  2. WP-CLI repair:
     ```bash
     wp db repair
     # if that cannot connect, enable the built-in repair page:
     # add to wp-config.php: define( 'WP_ALLOW_REPAIR', true );
     # then visit: https://example.com/wp-admin/maint/repair.php
     # REMOVE the constant afterward.
     ```
  3. phpMyAdmin repair: select the database → check the affected tables → **With selected: Repair table**.
  4. If repair fails, re-import from the last known-good SQL backup.

> **Caution:** Leaving `WP_ALLOW_REPAIR` enabled exposes the repair page publicly (no login required). Remove it immediately after use.

---

## 11. Best Practices

- **Always make a fresh backup before beginning.** Never trust an old or unverified backup as your safety net.
- **Never overwrite the only working copy** of files or database. Copy, don't move, until success is confirmed.
- **Test on a staging site or subdomain first** for anything non-trivial. Validate before touching production.
- **Verify functionality before DNS changes.** DNS is the *last* step, not the first.
- **Keep backups until the client confirms success** in writing — then keep them per the retention policy.
- **Document every migration** in the ticket: what moved, from/to, versions, issues, and the verification checklist.
- **Create a new backup immediately after a successful migration** so the new baseline is protected.
- **Lower DNS TTL 24–48 hours before a planned cutover** to shorten propagation.
- **Use serialization-safe tools** (`wp search-replace`, WP Toolkit) for URL changes — never raw SQL find/replace.
- **Match PHP versions** between source and destination during the move, then upgrade deliberately.
- **Keep `wp-config.php` at 600/640** and never `777` anything.

---

## 12. Internal Checklists

Printable, copy-into-ticket checklists for the most common jobs.

### 12.1 New Website Migration

- [ ] Ticket/work order and maintenance window confirmed
- [ ] Pre-migration snapshot recorded (PHP, WP, plugins, theme, DNS, SSL, DB)
- [ ] Fresh verified backup of source (files + DB) stored off-server
- [ ] Destination account/subdomain created
- [ ] Files copied to destination doc root
- [ ] Database created, user granted, SQL imported
- [ ] `wp-config.php` updated (DB creds, table prefix, salts)
- [ ] Permissions set (755/644, wp-config 640)
- [ ] URLs replaced with `wp search-replace` (dry-run then real)
- [ ] Permalinks flushed / `.htaccess` valid
- [ ] SSL issued and verified; no mixed content
- [ ] All caches purged (in order)
- [ ] Post-migration verification checklist complete
- [ ] DNS updated (last step)
- [ ] Fresh backup of migrated site created
- [ ] Documented; client notified

### 12.2 Website Recovery

- [ ] Symptom and error captured (debug log / server error log)
- [ ] **Backup taken of the broken state** before changes
- [ ] Root cause identified (plugin/theme/.htaccess/DB/PHP/SSL)
- [ ] Fix applied per the matching Recovery Procedure (Section 10)
- [ ] Site verified against Post-Migration checklist
- [ ] Caches purged
- [ ] Fresh backup of recovered site created
- [ ] Incident documented (cause + fix)

### 12.3 Domain Change

- [ ] New domain confirmed and added to the account
- [ ] TTL lowered on DNS in advance
- [ ] Fresh backup taken
- [ ] `home`/`siteurl` updated; `wp search-replace old→new`
- [ ] Permalinks flushed; `.htaccess` valid
- [ ] AutoSSL re-issued for the new domain; padlock verified
- [ ] Mixed content resolved
- [ ] Redirects from old domain configured (301)
- [ ] Caches and CDN purged
- [ ] Verification checklist complete
- [ ] Fresh backup created; documented

### 12.4 Hosting Transfer

- [ ] Source and destination access confirmed
- [ ] Full account backup (or per-site files + DB) taken from source
- [ ] Data transferred to destination server
- [ ] Databases created/imported; users granted
- [ ] `wp-config.php` DB host/creds updated
- [ ] PHP version matched to source
- [ ] Site tested on temporary URL / hosts-file before DNS
- [ ] SSL prepared for cutover
- [ ] Nameservers / A records updated (last step)
- [ ] Verification checklist complete
- [ ] Old host kept live until confirmed; documented

### 12.5 WordPress Clone

- [ ] Clone method chosen (WP Toolkit preferred)
- [ ] Destination subdomain/path created
- [ ] Files copied; new DB created and imported
- [ ] `wp-config.php` DB + table prefix + fresh salts set
- [ ] URLs replaced (serialization-safe)
- [ ] Permissions set; permalinks flushed
- [ ] Clone isolated from original (separate DB, separate salts)
- [ ] Verified; documented as staging/clone (not indexed by search engines if staging: `wp option update blog_public 0`)

### 12.6 Disaster Recovery

- [ ] Incident declared; scope and last-known-good identified
- [ ] Most recent verified backup located (off-server copy)
- [ ] Affected site isolated (maintenance mode / offline)
- [ ] Files restored from backup
- [ ] Database restored from backup (`wp db import` / phpMyAdmin)
- [ ] `wp-config.php` reconnected to correct DB
- [ ] URLs/permalinks/SSL verified
- [ ] Security review: change all passwords, salts, scan for malware (WP Toolkit → Security)
- [ ] Full verification checklist complete
- [ ] Root-cause and timeline documented
- [ ] Fresh backup of the recovered site created

---

## 13. Integration

This SOP is a permanent component of the **All Elite Cloud Operations Manual**. It should be **linked from any future Hosting, WordPress, Website Management, or Disaster Recovery documentation** rather than having its procedures duplicated. When another document needs one of these steps, **cross-reference this SOP** so there is a single source of truth to maintain.

**Related documentation in this repository:**

- [`10_DEPLOYMENT.md`](10_DEPLOYMENT.md) — deploying the Faith Harbor OS platform engine (the Node app behind All Elite Cloud) to cPanel.
- [`DEPLOYMENT-CPANEL.md`](DEPLOYMENT-CPANEL.md) — cPanel/WHM deployment guide for the platform, including subdomain, Node app, and SSL setup.

> **Note:** Those documents cover deploying the **platform engine**. *This* document covers migrating and recovering **client WordPress sites** hosted on the platform. Keep the two concerns separate and link, don't copy.

---

## 14. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| v1.0 | 2026-07-28 | All Elite Cloud Operations | Initial release of the WordPress Website Migration & Recovery Procedure. |

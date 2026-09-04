<?php
/**
 * Hexfire global leaderboard API (daily + all-time).
 * GET  ?board=daily|alltime&date=YYYY-MM-DD&contentVersion=1
 * POST JSON { boards, date, playerId, name, score, ... }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const MAX_ENTRIES = 100;
const MAX_SCORE = 50000000;
const MAX_NAME = 24;
const CURRENT_CONTENT_VERSION = '1';
const LEADERBOARD_RESET_KEY = 'hexfire-dev-reset-boards';

function fail($status, $code, $message) {
    http_response_code($status);
    echo json_encode(['ok' => false, 'code' => $code, 'error' => $message]);
    exit;
}

function utc_today() {
    return gmdate('Y-m-d');
}

function utc_yesterday() {
    return gmdate('Y-m-d', time() - 86400);
}

function sanitize_name($raw) {
    $name = trim(html_entity_decode((string)$raw, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $name = preg_replace('/<[^>]*>/', '', $name);
    $name = preg_replace('/[\x00-\x1f]/', '', $name);
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, MAX_NAME, 'UTF-8');
    } else {
        $name = substr($name, 0, MAX_NAME);
    }
    $name = trim($name);
    return $name !== '' ? $name : 'Player';
}

function daily_seed($dateKey, $contentVersion) {
    $s = 'hexfire-daily|' . $dateKey . '|' . $contentVersion;
    $h1 = 0xdeadbeef ^ strlen($s);
    $h2 = 0x41c6ce57 ^ strlen($s);
    $len = strlen($s);
    for ($i = 0; $i < $len; $i++) {
        $ch = ord($s[$i]);
        $h1 = (int)(($h1 ^ $ch) * 2654435761);
        $h2 = (int)(($h2 ^ $ch) * 1597334677);
    }
    return sprintf('%u', crc32($s));
}

function open_db() {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        fail(500, 'DB', 'Could not create data directory. Make api/data writable.');
    }
    $path = $dir . '/hexfire-leaderboard.sqlite';
    try {
        $pdo = new PDO('sqlite:' . $path);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA journal_mode=WAL;');
        $pdo->exec('PRAGMA busy_timeout=4000;');
        $pdo->exec('CREATE TABLE IF NOT EXISTS daily_scores (
            date TEXT NOT NULL,
            player_id TEXT NOT NULL,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            wave INTEGER NOT NULL DEFAULT 0,
            wave_group INTEGER NOT NULL DEFAULT 0,
            stars INTEGER NOT NULL DEFAULT 0,
            platform TEXT NOT NULL DEFAULT "web",
            meta_wave_group INTEGER NOT NULL DEFAULT 0,
            content_version TEXT NOT NULL DEFAULT "1",
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (date, player_id)
        )');
        $pdo->exec('CREATE TABLE IF NOT EXISTS alltime_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT NOT NULL,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            wave INTEGER NOT NULL DEFAULT 0,
            wave_group INTEGER NOT NULL DEFAULT 0,
            stars INTEGER NOT NULL DEFAULT 0,
            platform TEXT NOT NULL DEFAULT "web",
            meta_wave_group INTEGER NOT NULL DEFAULT 0,
            content_version TEXT NOT NULL DEFAULT "1",
            mode TEXT NOT NULL DEFAULT "campaign",
            run_id TEXT NOT NULL DEFAULT "",
            updated_at INTEGER NOT NULL
        )');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_daily_score ON daily_scores (date, score DESC, wave DESC)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_alltime_score ON alltime_scores (score DESC, wave DESC, updated_at ASC)');
        migrate_alltime_schema($pdo);
        return $pdo;
    } catch (Throwable $e) {
        fail(500, 'DB', 'SQLite is unavailable. Enable PDO_SQLITE or make api/data writable.');
    }
}

function table_has_column(PDO $pdo, $table, $column) {
    $stmt = $pdo->query('PRAGMA table_info(' . $table . ')');
    if (!$stmt) return false;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (($row['name'] ?? '') === $column) return true;
    }
    return false;
}

function migrate_alltime_schema(PDO $pdo) {
    if (!table_has_column($pdo, 'alltime_scores', 'id')) {
        $pdo->exec('ALTER TABLE alltime_scores RENAME TO alltime_scores_legacy');
        $pdo->exec('CREATE TABLE alltime_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT NOT NULL,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            wave INTEGER NOT NULL DEFAULT 0,
            wave_group INTEGER NOT NULL DEFAULT 0,
            stars INTEGER NOT NULL DEFAULT 0,
            platform TEXT NOT NULL DEFAULT "web",
            meta_wave_group INTEGER NOT NULL DEFAULT 0,
            content_version TEXT NOT NULL DEFAULT "1",
            mode TEXT NOT NULL DEFAULT "campaign",
            run_id TEXT NOT NULL DEFAULT "",
            updated_at INTEGER NOT NULL
        )');
        $pdo->exec(
            'INSERT INTO alltime_scores (player_id, name, score, wave, wave_group, stars, platform,
             meta_wave_group, content_version, mode, run_id, updated_at)
             SELECT player_id, name, score, wave, wave_group, stars, platform,
             meta_wave_group, content_version, mode, "", updated_at
             FROM alltime_scores_legacy'
        );
        $pdo->exec('DROP TABLE alltime_scores_legacy');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_alltime_score ON alltime_scores (score DESC, wave DESC, updated_at ASC)');
    }
    if (!table_has_column($pdo, 'alltime_scores', 'run_id')) {
        $pdo->exec('ALTER TABLE alltime_scores ADD COLUMN run_id TEXT NOT NULL DEFAULT ""');
    }
}

function row_to_entry($row) {
    return [
        'playerId' => $row['player_id'],
        'name' => $row['name'],
        'score' => (int)$row['score'],
        'wave' => (int)$row['wave'],
        'waveGroup' => (int)$row['wave_group'],
        'stars' => (int)$row['stars'],
        'platform' => $row['platform'] === 'steam' ? 'steam' : 'web',
        'metaWaveGroup' => (int)$row['meta_wave_group'],
        'timestamp' => (int)$row['updated_at'],
        'mode' => isset($row['mode']) ? $row['mode'] : '',
    ];
}

function fetch_board(PDO $pdo, $board, $date, $contentVersion) {
    if ($board === 'alltime') {
        $stmt = $pdo->prepare(
            'SELECT * FROM alltime_scores ORDER BY score DESC, wave DESC, updated_at ASC LIMIT ?'
        );
        $stmt->execute([MAX_ENTRIES]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT * FROM daily_scores WHERE date = ? AND content_version = ?
             ORDER BY score DESC, wave DESC, updated_at ASC LIMIT ?'
        );
        $stmt->execute([$date, $contentVersion, MAX_ENTRIES]);
    }
    $entries = [];
    $rank = 1;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $entry = row_to_entry($row);
        $entry['rank'] = $rank++;
        $entries[] = $entry;
    }
    return $entries;
}

function upsert_daily(PDO $pdo, $payload) {
    $stmt = $pdo->prepare('SELECT score, wave FROM daily_scores WHERE date = ? AND player_id = ?');
    $stmt->execute([$payload['date'], $payload['playerId']]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        $oldScore = (int)$existing['score'];
        $oldWave = (int)$existing['wave'];
        if ($payload['score'] < $oldScore || ($payload['score'] === $oldScore && $payload['wave'] <= $oldWave)) {
            return false;
        }
        $upd = $pdo->prepare(
            'UPDATE daily_scores SET name=?, score=?, wave=?, wave_group=?, stars=?, platform=?,
             meta_wave_group=?, content_version=?, updated_at=? WHERE date=? AND player_id=?'
        );
        $upd->execute([
            $payload['name'], $payload['score'], $payload['wave'], $payload['waveGroup'],
            $payload['stars'], $payload['platform'], $payload['metaWaveGroup'],
            $payload['contentVersion'], $payload['updatedAt'],
            $payload['date'], $payload['playerId'],
        ]);
        return true;
    }
    $ins = $pdo->prepare(
        'INSERT INTO daily_scores (date, player_id, name, score, wave, wave_group, stars, platform,
         meta_wave_group, content_version, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );
    $ins->execute([
        $payload['date'], $payload['playerId'], $payload['name'], $payload['score'],
        $payload['wave'], $payload['waveGroup'], $payload['stars'], $payload['platform'],
        $payload['metaWaveGroup'], $payload['contentVersion'], $payload['updatedAt'],
    ]);
    return true;
}

function insert_alltime(PDO $pdo, $payload) {
    $runId = isset($payload['runId']) ? substr(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$payload['runId']), 0, 80) : '';
    if ($runId !== '') {
        $dup = $pdo->prepare('SELECT id FROM alltime_scores WHERE player_id = ? AND run_id = ? LIMIT 1');
        $dup->execute([$payload['playerId'], $runId]);
        if ($dup->fetch(PDO::FETCH_ASSOC)) {
            return false;
        }
    } else {
        $dup = $pdo->prepare(
            'SELECT id FROM alltime_scores WHERE player_id = ? AND score = ? AND wave = ? AND updated_at >= ? LIMIT 1'
        );
        $dup->execute([$payload['playerId'], $payload['score'], $payload['wave'], $payload['updatedAt'] - 30]);
        if ($dup->fetch(PDO::FETCH_ASSOC)) {
            return false;
        }
    }
    $ins = $pdo->prepare(
        'INSERT INTO alltime_scores (player_id, name, score, wave, wave_group, stars, platform,
         meta_wave_group, content_version, mode, run_id, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $ins->execute([
        $payload['playerId'], $payload['name'], $payload['score'], $payload['wave'],
        $payload['waveGroup'], $payload['stars'], $payload['platform'], $payload['metaWaveGroup'],
        $payload['contentVersion'], $payload['mode'], $runId, $payload['updatedAt'],
    ]);
    $keep = $pdo->query(
        'SELECT id FROM alltime_scores ORDER BY score DESC, wave DESC, updated_at ASC LIMIT 200'
    )->fetchAll(PDO::FETCH_COLUMN);
    if (is_array($keep) && count($keep) >= 200) {
        $placeholders = implode(',', array_fill(0, count($keep), '?'));
        $del = $pdo->prepare("DELETE FROM alltime_scores WHERE id NOT IN ($placeholders)");
        $del->execute(array_values($keep));
    }
    return true;
}

$pdo = open_db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $board = isset($_GET['board']) && $_GET['board'] === 'alltime' ? 'alltime' : 'daily';
    $date = isset($_GET['date']) ? preg_replace('/[^0-9\-]/', '', $_GET['date']) : utc_today();
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $date = utc_today();
    }
    $contentVersion = isset($_GET['contentVersion']) && $_GET['contentVersion'] !== ''
        ? preg_replace('/[^a-zA-Z0-9._\-]/', '', $_GET['contentVersion'])
        : CURRENT_CONTENT_VERSION;
    $entries = fetch_board($pdo, $board, $date, $contentVersion);
    echo json_encode([
        'ok' => true,
        'board' => $board,
        'date' => $date,
        'contentVersion' => $contentVersion,
        'seed' => $board === 'daily' ? daily_seed($date, $contentVersion) : null,
        'entries' => $entries,
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, 'METHOD', 'Use GET or POST.');
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    fail(400, 'JSON', 'Invalid JSON body.');
}

if (($body['action'] ?? '') === 'reset') {
    $resetKey = (string)($body['resetKey'] ?? '');
    if ($resetKey === '' || !hash_equals(LEADERBOARD_RESET_KEY, $resetKey)) {
        fail(403, 'RESET', 'Invalid reset key.');
    }
    try {
        $pdo->exec('DELETE FROM daily_scores');
        $pdo->exec('DELETE FROM alltime_scores');
        try {
            $pdo->exec("DELETE FROM sqlite_sequence WHERE name IN ('daily_scores','alltime_scores')");
        } catch (Throwable $ignored) {
        }
    } catch (Throwable $e) {
        fail(500, 'DB', 'Could not reset leaderboards.');
    }
    echo json_encode(['ok' => true, 'reset' => true]);
    exit;
}

$debug = !empty($body['debug']);
if ($debug) {
    fail(400, 'DEBUG', 'Debug runs cannot be submitted.');
}

$contentVersion = isset($body['contentVersion']) ? preg_replace('/[^a-zA-Z0-9._\-]/', '', (string)$body['contentVersion']) : CURRENT_CONTENT_VERSION;
if ($contentVersion === '') {
    $contentVersion = CURRENT_CONTENT_VERSION;
}

$playerId = isset($body['playerId']) ? substr(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$body['playerId']), 0, 80) : '';
if ($playerId === '') {
    fail(400, 'PLAYER', 'Missing playerId.');
}

$score = (int)($body['score'] ?? -1);
if ($score < 0 || $score > MAX_SCORE) {
    fail(400, 'SCORE', 'Invalid score.');
}

$date = isset($body['date']) ? preg_replace('/[^0-9\-]/', '', (string)$body['date']) : utc_today();
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    $date = utc_today();
}

$today = utc_today();
$yesterday = utc_yesterday();
$boards = $body['boards'] ?? ['alltime'];
if (!is_array($boards)) $boards = ['alltime'];
$boards = array_values(array_unique(array_map('strval', $boards)));

$wantsDaily = in_array('daily', $boards, true);
if ($wantsDaily && $date !== $today && $date !== $yesterday) {
    $wantsDaily = false;
}

$payload = [
    'date' => $date,
    'playerId' => $playerId,
    'name' => sanitize_name($body['name'] ?? 'Player'),
    'score' => $score,
    'wave' => max(0, (int)($body['wave'] ?? 0)),
    'waveGroup' => max(0, (int)($body['waveGroup'] ?? 0)),
    'stars' => max(0, (int)($body['stars'] ?? 0)),
    'platform' => (($body['platform'] ?? '') === 'steam') ? 'steam' : 'web',
    'metaWaveGroup' => max(0, (int)($body['metaWaveGroup'] ?? 0)),
    'contentVersion' => $contentVersion,
    'mode' => (($body['mode'] ?? '') === 'daily') ? 'daily' : 'campaign',
    'runId' => isset($body['runId']) ? substr(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$body['runId']), 0, 80) : '',
    'updatedAt' => time(),
];

$acceptedDaily = false;
$acceptedAlltime = false;
try {
    $pdo->beginTransaction();
    if ($wantsDaily) {
        $acceptedDaily = upsert_daily($pdo, $payload);
    }
    if (in_array('alltime', $boards, true) || $wantsDaily) {
        $acceptedAlltime = insert_alltime($pdo, $payload);
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail(500, 'DB', 'Could not save score.');
}

$dailyEntries = $wantsDaily ? fetch_board($pdo, 'daily', $date, $contentVersion) : [];
$alltimeEntries = fetch_board($pdo, 'alltime', $date, $contentVersion);

$rankDaily = null;
$rankAlltime = null;
foreach ($dailyEntries as $e) {
    if ($e['playerId'] === $playerId) { $rankDaily = $e['rank']; break; }
}
foreach ($alltimeEntries as $e) {
    if ($e['playerId'] === $playerId) { $rankAlltime = $e['rank']; break; }
}

echo json_encode([
    'ok' => true,
    'accepted' => $acceptedDaily || $acceptedAlltime,
    'acceptedDaily' => $acceptedDaily,
    'acceptedAlltime' => $acceptedAlltime,
    'rankDaily' => $rankDaily,
    'rankAlltime' => $rankAlltime,
]);

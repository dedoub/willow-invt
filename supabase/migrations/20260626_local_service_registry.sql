CREATE TABLE IF NOT EXISTS local_service_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL DEFAULT 'job' CHECK (kind IN ('daemon', 'job')),
    start_mode TEXT NOT NULL DEFAULT 'detached' CHECK (start_mode IN ('command', 'detached')),
    cwd TEXT,
    start_command JSONB,
    stop_command JSONB,
    pid_file TEXT,
    lock_file TEXT,
    log_path TEXT,
    process_patterns TEXT[],
    launchd_label TEXT,
    healthcheck_url TEXT,
    aliases TEXT[],
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_protected BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_service_registry_enabled
    ON local_service_registry (is_enabled, kind);

CREATE INDEX IF NOT EXISTS idx_local_service_registry_aliases
    ON local_service_registry USING gin (aliases);

DROP TRIGGER IF EXISTS update_local_service_registry_updated_at ON local_service_registry;
CREATE TRIGGER update_local_service_registry_updated_at
    BEFORE UPDATE ON local_service_registry
    FOR EACH ROW
    EXECUTE FUNCTION willow_update_updated_at_column();

ALTER TABLE local_service_registry ENABLE ROW LEVEL SECURITY;

INSERT INTO local_service_registry (
    service_key, display_name, description, kind, start_mode, cwd,
    start_command, pid_file, lock_file, log_path, process_patterns,
    launchd_label, aliases, is_enabled, is_protected
) VALUES
(
    'willy-bot',
    'Willy Telegram Bot',
    '윌로우 COO 텔레그램 에이전트',
    'daemon',
    'command',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-telegram-bot.sh', '--daemon'),
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/telegram-bot.pid',
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/telegram-bot.lock',
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/telegram-bot.log',
    ARRAY['scripts/telegram-bot.ts'],
    'com.willow.telegram-bot',
    ARRAY['윌리', '윌리봇', 'telegram-bot', 'willy bot'],
    true,
    true
),
(
    'rina-bot',
    'Rina Study Bot',
    '류하 학습관리 텔레그램 봇',
    'daemon',
    'command',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-ryuha-bot.sh', '--daemon'),
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/ryuha-bot.pid',
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/ryuha-bot.lock',
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/ryuha-bot.log',
    ARRAY['scripts/ryuha-telegram-bot.ts'],
    NULL,
    ARRAY['리나', '리나봇', '류하봇', 'ryuha-bot', 'rina bot'],
    true,
    true
),
(
    'market-research-scan',
    'Market Research Scan',
    '밸류체인/소형주 통합 리서치 스캔',
    'job',
    'detached',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-market-research-scan.sh'),
    NULL,
    NULL,
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/market-research-scan.log',
    ARRAY['scripts/market-research-scan.ts'],
    NULL,
    ARRAY['리서치스캔', '시장리서치', 'smallcap scan'],
    true,
    true
),
(
    'knowledge-distill',
    'Knowledge Distill',
    '지식 정제 파이프라인',
    'job',
    'detached',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-knowledge-distill.sh'),
    NULL,
    NULL,
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/knowledge-distill.log',
    ARRAY['scripts/knowledge-distill.ts'],
    NULL,
    ARRAY['지식정제', 'knowledge distill'],
    true,
    true
),
(
    'real-estate-sync',
    'Real Estate Sync',
    '부동산 실거래가 동기화',
    'job',
    'detached',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-real-estate-sync.sh'),
    NULL,
    NULL,
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/real-estate-sync.log',
    ARRAY['scripts/real-estate-pipeline.ts'],
    NULL,
    ARRAY['부동산동기화', '실거래가', 'real estate'],
    true,
    true
),
(
    'sector-rotation',
    'Sector Rotation',
    '섹터 로테이션 데이터 수집',
    'job',
    'detached',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-sector-rotation.sh'),
    NULL,
    NULL,
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/sector-rotation.log',
    ARRAY['scripts/sector-rotation-fetch.ts'],
    'com.willow.sector-rotation',
    ARRAY['섹터로테이션', 'sector rotation'],
    true,
    true
),
(
    'toss-sync',
    'Toss Sync',
    '토스 거래내역/잔고 동기화',
    'job',
    'detached',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-toss-sync.sh'),
    NULL,
    NULL,
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/toss-sync.log',
    ARRAY['scripts/toss-sync.ts'],
    NULL,
    ARRAY['토스싱크', 'toss sync'],
    true,
    true
),
(
    'toss-prices',
    'Toss Prices',
    '토스 시세 업데이트',
    'job',
    'detached',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-toss-prices.sh'),
    NULL,
    NULL,
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/toss-prices.log',
    ARRAY['scripts/toss-prices.ts'],
    NULL,
    ARRAY['토스시세', 'toss prices'],
    true,
    true
),
(
    'tensw-weekly-reports',
    'Tensw Weekly Reports',
    '텐소프트웍스 주간 리포트 생성 (현재 비활성화)',
    'job',
    'detached',
    '/Volumes/PRO-G40/app-dev/willow-invt',
    jsonb_build_array('/bin/bash', '/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-tensw-weekly-reports.sh'),
    NULL,
    NULL,
    '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tensw-weekly-reports.log',
    ARRAY['run-tensw-weekly-reports.sh'],
    NULL,
    ARRAY['주간리포트', 'weekly reports', 'tensw weekly'],
    false,
    true
)
ON CONFLICT (service_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    kind = EXCLUDED.kind,
    start_mode = EXCLUDED.start_mode,
    cwd = EXCLUDED.cwd,
    start_command = EXCLUDED.start_command,
    pid_file = EXCLUDED.pid_file,
    lock_file = EXCLUDED.lock_file,
    log_path = EXCLUDED.log_path,
    process_patterns = EXCLUDED.process_patterns,
    launchd_label = EXCLUDED.launchd_label,
    aliases = EXCLUDED.aliases,
    is_enabled = EXCLUDED.is_enabled,
    is_protected = EXCLUDED.is_protected;

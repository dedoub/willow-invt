UPDATE local_service_registry
SET
    description = '텐소프트웍스 주간 리포트 생성 (현재 비활성화)',
    process_patterns = ARRAY['run-tensw-weekly-reports.sh'],
    is_enabled = false,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'disabled_reason', 'target script missing',
        'disabled_at', NOW()
    ),
    updated_at = NOW()
WHERE service_key = 'tensw-weekly-reports';

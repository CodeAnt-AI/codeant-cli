/**
 * SARIF 2.1.0 formatter.
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

const SEV_TO_SARIF = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'none',
  unknown: 'none',
};

export default {
  name: 'sarif',
  mime: 'application/sarif+json',
  extension: '.sarif',
  render(envelope) {
    const { findings = [], repo, scan, tool_version } = envelope;

    // Build per-category rule sets
    const ruleMap = new Map();
    for (const f of findings) {
      const key = `${f.category}/${f.check_id || f.check_name}`;
      if (!ruleMap.has(key)) {
        ruleMap.set(key, {
          id: key,
          name: f.check_name || f.check_id || 'issue',
          shortDescription: { text: f.check_name || f.check_id || 'issue' },
          properties: { category: f.category, severity: f.severity },
        });
      }
    }

    const rules = [...ruleMap.values()];

    const results = findings.map((f) => {
      const ruleId = `${f.category}/${f.check_id || f.check_name}`;
      const result = {
        ruleId,
        level: SEV_TO_SARIF[f.severity] ?? 'warning',
        message: { text: f.message || f.check_name || 'issue' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: f.file_path, uriBaseId: '%SRCROOT%' },
              region: {
                startLine: f.line_number || 1,
                endLine: (f.line_range && f.line_range.length > 1)
                  ? f.line_range[f.line_range.length - 1]
                  : f.line_number || 1,
              },
            },
          },
        ],
        properties: {
          findingId: f.id,
          category: f.category,
          severity: f.severity,
          dismissed: f.dismissed,
        },
      };

      if (f.cwe) result.taxa = [{ toolComponent: { name: 'CWE' }, id: f.cwe }];
      if (f.package) result.properties.package = f.package;

      return result;
    });

    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'codeant-cli',
              version: tool_version || '0.0.0',
              informationUri: 'https://www.codeant.ai',
              rules,
            },
          },
          versionControlProvenance: scan
            ? [
                {
                  repositoryUri: repo,
                  revisionId: scan.commit_id,
                  branch: scan.branch || undefined,
                },
              ]
            : undefined,
          results,
          properties: {
            repo,
            generatedAt: envelope.generated_at,
            schemaVersion: envelope.schema_version,
          },
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  },
};

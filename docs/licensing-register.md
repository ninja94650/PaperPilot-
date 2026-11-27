# PaperPilot licensing register

Generated from installed package metadata by npm run licensing:generate.
Only permissive direct dependency licences are accepted by this initial gate; transitive components are represented in sbom.cdx.json and still require release review.

| Scope | Package | Manifest constraint | Resolved version | Declared licence | Upstream |
|---|---|---:|---:|---|---|
| Production | @supabase/ssr | 0.7.0 | 0.7.0 | MIT | [https://github.com/supabase/ssr](https://github.com/supabase/ssr) |
| Production | @supabase/supabase-js | 2.89.0 | 2.89.0 | MIT | [https://github.com/supabase/supabase-js](https://github.com/supabase/supabase-js) |
| Production | lucide-react | ^0.468.0 | 0.468.0 | ISC | [https://github.com/lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| Production | next | 15.5.29 | 15.5.29 | MIT | [vercel/next.js](vercel/next.js) |
| Production | pdf-lib | ^1.17.1 | 1.17.1 | MIT | [https://github.com/Hopding/pdf-lib](https://github.com/Hopding/pdf-lib) |
| Production | react | ^19.1.1 | 19.3.1 | MIT | [https://github.com/react/react](https://github.com/react/react) |
| Production | react-dom | ^19.1.1 | 19.3.1 | MIT | [https://github.com/react/react](https://github.com/react/react) |
| Development | @types/node | ^22.13.4 | 22.20.7 | MIT | [https://github.com/DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| Development | @types/react | ^19.0.8 | 19.3.3 | MIT | [https://github.com/DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| Development | @types/react-dom | ^19.0.3 | 19.3.0 | MIT | [https://github.com/DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| Development | typescript | ^5.7.3 | 5.9.3 | Apache-2.0 | [https://github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| Transitive security override | postcss | ^8.5.23 | 8.5.33 | MIT | [postcss/postcss](postcss/postcss) |

## Policy

- No paid SDK, API, font, image, template or hosted dependency is approved by this register.
- Direct dependencies and explicit security overrides must declare MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause or 0BSD.
- Unknown or non-allowlisted direct dependency licences fail generation and must be reviewed before use.
- sbom.cdx.json records the resolved dependency graph; transitive licence obligations and bundled notices must be reviewed before public distribution.
- Re-run the generator and refresh the SBOM whenever package manifests or lockfiles change.

This is an engineering inventory, not legal advice.

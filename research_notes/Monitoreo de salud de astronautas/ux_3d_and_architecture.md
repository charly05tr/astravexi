# Astronaut Health Monitoring App: 3D Body Model, UX/HCI, and Delayed-Comms Architecture

Research date: 2026-11-14. Note: tool budget was limited (about 18 calls). Claims without a URL were moved to Gaps or labeled as unverified inferences.

## (a) 3D body model assets and rendering stack

### Takeaway
BodyParts3D / Z-Anatomy are the best free, organ-segmented sources, but both are copyleft (CC BY-SA) and Z-Anatomy bundles a few non-commercial sub-models; fine for a public hackathon if you attribute and share-alike. Ready Player Me is dead (shut down Jan 2026). three.js + React Three Fiber (R3F) + drei is the pragmatic rendering stack.

### Cited Findings
- BodyParts3D (DBCLS, Japan) is licensed CC BY-SA 2.1 Japan; required attribution string: "BodyParts3D, Copyright (c) The Database Center for Life Science licensed by CC Attribution-Share Alike 2.1 Japan". Derivatives must carry the same license. — [DBCLS README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html); [Anatomography (Wikipedia)](https://en.wikipedia.org/wiki/Anatomography)
- BodyParts3D is distributed as zipped, organ-specific Wavefront OBJ files (one archived release notes 99% polygon reduction). — [DBCLS README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20100816/README_e.html)
- An older 2009 README mentioned an extra requirement to ask the licensor for uses outside standard terms; the 2010 README says the license was updated 2011/08/25. Check the current license page. — [2009 README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20090209/README_e.html); [2010 README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20100816/README_e.html)
- Z-Anatomy: all code and content CC BY-SA 4.0, derivatives must use same license. Distributed as a Blender application template (Z-Anatomy.zip), plus Z-Biomechanics.7z and a TA2.csv (terminology). Models derived from BodyParts3D; definitions from Wikipedia (CC BY-SA 3.0). — [Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy)
- Z-Anatomy contains components with non-commercial terms: Inner Ear (CC BY-NC-SA 4.0, Univ. of Dundee) and Kidney (CC BY-NC 4.0, Lissie Cowley). Exclude or replace these if the project might go commercial. — [Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy)
- Z-Anatomy repo shows 397 commits and a 2026 footer, i.e. appears maintained; exact last-update date not shown. — [Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy)
- NIH 3D / 3D Print Exchange: license is per model. Examples: a Visible Human female leg bone set is CC BY-NC-SA ([3DPX-016666](https://3d.nih.gov/entries/3DPX-016666)); a low-res Visible Human male skull and eyes is CC BY ([3DPX-020591](https://3d.nih.gov/entries/3DPX-020591)). Formats commonly STL, VRML, X3D, Blender; glTF not mentioned. — [anatomytool.org on NIH 3D](https://anatomytool.org/node/58594)
- NLM Visible Human free-download products are under CC BY-NC-ND (no derivatives, so not suitable for modifying/segmenting). — [NLM Visible Human products](https://nlm.nih.gov/research/visible/products.html)
- Visible Human-derived musculoskeletal geometry: 260 geometries (76 muscles, 28 bones, 16 cartilages, 8 ligaments, 2 fat per subject) lower-extremity only. — [SimTK 3d-vh-geometry](https://simtk.org/projects/3d-vh-geometry)
- Ready Player Me: Netflix acquired it Dec 2025 and public services shut down Jan 31, 2026 (one source says Jan 30). Do not depend on it. Sources conflict on whether previously exported GLBs remain usable. — [PocketGamer.biz](https://www.pocketgamer.biz/netflix-acquires-avatar-creation-platform-ready-player-me); [Avatar SDK 2026 roundup](https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/)
- three.js current npm version: 0.187.0, MIT license. — [npm registry](https://registry.npmjs.org/three/latest)
- @react-three/fiber latest stable 9.6.1 (as of an April 2026 snapshot); v10 only alpha/canary as of early 2026. drei 10.7.7 peers on fiber ^9.0.0 and three >=0.159. — [DepScope](https://depscope.dev/pkg/npm/@react-three/fiber); [Snyk](https://security.snyk.io/package/npm/%40react-three%2Ffiber); [drei package.json](https://cdn.jsdelivr.net/npm/@react-three/drei@10.7.7/package.json)
- three.js ships GLTFLoader, DRACOLoader and KTX2Loader as addons; no meshopt loader appeared in the docs index page I fetched (meshopt decoder is in examples/jsm/libs, unverified here). — [three.js docs](https://threejs.org/docs/)

### Inferences
- Fastest path: take BodyParts3D OBJs (or Z-Anatomy exports), merge per system (skeletal, muscular, cardiovascular, nervous, organs), export one glTF/GLB from Blender with named nodes per organ, then compress. Named meshes enable raycast picking and per-mesh material color (heatmap-by-color per organ) with no custom shaders.
- Because CC BY-SA is share-alike, publishing the repo with the model under CC BY-SA and an attribution page keeps a public hackathon project compliant. Avoid the NC components of Z-Anatomy.
- Ready Player Me is not an option; for a rigged generic body, MakeHuman or a Blender base mesh is the safer alternative (not verified here).

### Gaps
- Polycounts of BodyParts3D / Z-Anatomy and exact organ/system segmentation: not found.
- MakeHuman/MPFB license, Mixamo terms, Sketchfab CC model licensing, Open Anatomy Project status: not searched/found successfully. (From memory MakeHuman exports are CC0 but this is unverified.)
- Babylon.js, Unity WebGL, Godot, model-viewer comparisons, Draco vs meshopt benchmark, tablet performance, LOD guidance: not researched.
- Current Babylon.js version: not found.

## Existing products with 3D body maps and UX lessons

### Takeaway
Not researched in this pass; no sourced findings.

### Cited Findings
- None.

### Inferences
- BioDigital Human, Complete Anatomy, Zygote Body are the named comparators from the brief; reviewer should treat them as unverified lead names.

### Gaps
- No sources fetched on BioDigital Human, Complete Anatomy, Zygote Body, body-map pain trackers or digital-twin dashboards.

## (b) UX / HCI for crew interfaces and alerting

### Takeaway
NASA's Display Standard requires an always-visible alert area and threshold-violation indication, and cites HIDH; alarm fatigue literature says most clinical alarms are non-actionable, so tiering and tuning thresholds per individual matter. NASA Playbook research shows crew self-scheduling works but preferences vary.

### Cited Findings
- NASA Display Standard (Appendix F) covers spaceflight elements, requires a dedicated always-visible area for key information including alerts, and requires showing operational-limit/telemetry-threshold violations; it lists HIDH (NASA/SP-20103407) as a supplemental document. — [NASA standards page](https://www.nasa.gov/?p=808242)
- A NASA snippet states a yellow or red up/down arrow after a telemetry value must indicate out-of-threshold Caution/Warning (source document not identified; verify). — [NASA standards page](https://www.nasa.gov/?p=808242)
- NASA-STD-3001 Vol. 2 revisions are public PDFs (Rev B approved 2019-09-09; Rev C, D, F also exist). — [Rev D PDF](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-2-rev-d-with-signature.pdf); [Rev C PDF](https://www.nasa.gov/wp-content/uploads/2020/10/2022-04-08_nasa-std-3001_vol_2_rev_c_final.pdf); [Rev B](https://standards.nasa.gov/sites/default/files/standards/NASA/C/Historical/nasa-std-3001_vol_2_rev_b.pdf)
- Do not rely on color alone for alerts: add high-contrast text, distinct icons, alternate shapes/patterns (design-industry guidance, not NASA). — [Cieden](https://cieden.com/book/sub-atomic/color/system-alerts-for-color-blind-users)
- In aviation research, increasing color deficiency decreased speed and accuracy on color-coded symbology. — [ASMA AMHP 87(11)](https://asma.kglmeridian.com/downloadpdf/view/journals/amhp/87/11/article-p921.pdf)
- NASA TLX is a subjective workload measure; in a four-scale comparison TLX and OW were superior in sensitivity and operator acceptance. — [IEOM 2023](https://ieomsociety.org/proceedings/2023detroit/69.pdf)
- Joint Commission Sentinel Event Alert 50 (2013): an estimated 85-99% of alarm signals do not require clinical intervention, often due to tight/default thresholds; fix requires leadership and a multidisciplinary approach. Later became a National Patient Safety Goal allowing customization by unit or individual patient. — [HCPLive](https://hcplive.com/view/recommendations-to-reduce-alarm-fatigue-issued-by-joint-commission); [Nurse.org](https://nurse.org/articles/alarm-fatigue-statistics-patient-safety)
- A 2022 AAMI review frames alarm fatigue sociotechnically (eight dimensions incl. human-computer interface and clinical content) and calls for user-centered design. — [AAMI review via NSF PAR](https://par.nsf.gov/servlets/purl/10336746)
- NASA Playbook: crews self-scheduled in NEEMO and HERA; Crew Autonomy Scheduling Test (CAST) on ISS in 2017 showed feasibility with no major usability issues found; HERA Campaign 6 (from Oct 2021) tested self-scheduling under simulated comm delays; crew preferences vary (some prefer not to self-schedule). — [NTRS 20180000770](https://ntrs.nasa.gov/citations/20180000770); [Zheng et al. 2023 SpaceCHI](https://hsi.arc.nasa.gov/publications/Zheng_etal_2023_SpaceCHI.pdf); [HERA C6 AIAA 2022](https://hsi.arc.nasa.gov/publications/AIAA_ASCEND_2022_HERA_C6.pdf)

### Inferences
- Design alert tiers (e.g., Info / Advisory / Caution / Warning) each with a unique color AND icon shape AND text label, plus a fixed alert region, matches the NASA display requirement and color-blind guidance.
- Per-person baselines (not population thresholds) should reduce nuisance alerts, consistent with the Joint Commission finding that default thresholds drive non-actionable alarms.
- Using NASA-TLX in a quick usability test is a defensible, citable evaluation method for a hackathon demo.

### Gaps
- Actual text of NASA-STD-3001 Vol. 2 alert/display requirements and HIDH sections was not read (only PDF links located).
- Progressive disclosure, explainability and uncertainty visualization literature: not researched.
- Body map + timeline dashboard patterns: not researched.

## (c) Offline-first / delayed-comms architecture, edge ML, privacy, hackathon stack

### Takeaway
Local-first principles (data on device, network optional, CRDT merge) map directly onto delayed comms; NASA HDTN is open-source (Apache-2.0) for DTN and can serve as a reference or simulated link, but a hackathon should simulate delay with a simple store-and-forward queue. Browser ML via ONNX Runtime Web / transformers.js / WebLLM is feasible.

### Cited Findings
- Ink & Switch's seven ideals include "The network is optional" (work offline, sync later), "No spinners", "Security and privacy by default", and propose CRDTs as a foundational technology so concurrent edits merge automatically. — [Ink & Switch](https://inkandswitch.com/essay/local-first/)
- Automerge treats the on-device copy as primary and works with or without a server; commentary says it is a general-purpose CRDT for JSON-like documents, while Yjs is optimized for text/shared documents (secondary, low-authority sources). — [Automerge docs](https://automerge.org/docs/hello/); [wal.sh](https://wal.sh/research/local-first)
- NASA HDTN: Apache-2.0, C++, GitHub nasa/HDTN; supports BPv6 (RFC 5050), BPv7 (BPSec on by default, needs OpenSSL FIPS module), LTP, TCPCLv3/v4; router uses a contact plan JSON to hold bundles in storage when a link is down; simulation via DtnSim (OMNeT++) tested only on Linux. — [nasa/HDTN](https://github.com/nasa/HDTN)
- HDTN reached up to 1 Gbps with 4 s RTT in a NASA test; tested on ISS (2024 paper). — [NTRS HDTN ISS Testing 2024](https://ntrs.nasa.gov/api/citations/20240007078/downloads/HDTN_ISS_Testing_2024.pdf); [NASA Glenn](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/scan/high-rate-delay-tolerant-networking)
- Mars one-way delay up to about 24 minutes, requiring unprecedented crew autonomy. — [NASA NTRS 20210023828](https://ntrs.nasa.gov/api/citations/20210023828/downloads/Decadal%20Topical%20-%20Development%20of%20Medical%20Capabilities%20and%20Technologies_New%20Graphic.docx.pdf)
- A simulator study of 16 three-person crews found medical checklists necessary but not sufficient for high autonomy without real-time flight surgeon support. — [PMC10466940](https://pmc.ncbi.nlm.nih.gov/articles/PMC10466940)
- Current EHR is accessible only to flight surgeons in Mission Control and JSC physicians; NASA proposes an access-controlled, PHI-compliant EHR also open to the Crew Medical Officer, with a single access layer for ground and crew. — [NASA NTRS 20210023828](https://ntrs.nasa.gov/api/citations/20210023828/downloads/Decadal%20Topical%20-%20Development%20of%20Medical%20Capabilities%20and%20Technologies_New%20Graphic.docx.pdf)
- NASA and Google tested CMO Digital Assistant (CMO-DA) as an autonomous first responder during comm delays (news-level source). — [MoneyOval](https://moneyoval.com/article/how-nasas-new-ai-doctor-could-treat-astronauts-on-mars-qmvixtc96ciaadp1qo13ad9s)
- ONNX Runtime Web supports WebGPU, WebGL, WebNN, WASM backends (WebGPU from ORT 1.17); transformers.js runs via ORT Web with `device: "webgpu"` or WASM fallback; WebLLM (MLC) is WebGPU-only and LLM-focused. Details change fast; blog-level sources. — [Microsoft Open Source blog](https://opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/); [Intel guide](https://www.intel.com/content/www/us/en/developer/articles/technical/web-developers-guide-to-in-browser-llms.html)

### Inferences
- Suggested 48-hour stack (my recommendation, not sourced): React + R3F/drei + GLB body from BodyParts3D/Z-Anatomy; synthetic wearable data simulator (HR, HRV, SpO2, temp, sleep) in a Web Worker; IndexedDB (or SQLite WASM) as local store; rule engine plus per-person rolling z-score baseline as the "edge ML" (ONNX model optional); a store-and-forward outbox with a configurable delay slider (e.g., 0 to 22 min) to simulate Earth link, merging via Automerge or last-write-wins per record; role views (Crew, CMO, Flight Surgeon) via a simple role switch. This avoids DTN installation overhead while remaining faithful to the DTN custody/contact-plan concept.
- Optional on-device LLM explanations via WebLLM are risky on tablets/weak GPUs; template-based "why am I seeing this" text driven by the rule that fired is safer for a demo, with LLM as stretch.
- Role separation mirrors the NASA proposal: crew sees own data, CMO has access, flight surgeon on ground receives delayed/synced data.

### Gaps
- ION (JPL) details, Yjs vs Automerge sizes/versions, SQLite-WASM/PowerSync/ElectricSQL/Replicache comparisons: not researched.
- TFLite/ONNX lightweight anomaly-detection model specifics, onboard compute constraints: no sourced data found.
- Formal data-privacy rules (HIPAA-equivalent, NASA medical data policy) for crew: found only the EHR access statement above.
- BioDigital/Complete Anatomy/Zygote Body UX lessons, uncertainty visualization: not researched.

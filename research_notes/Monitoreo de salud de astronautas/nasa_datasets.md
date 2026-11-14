# NASA and partner open datasets for an astronaut health monitoring app

Note on method: ~20 tool calls. Items marked "UNVERIFIED" come from my background knowledge or snippets and were not confirmed against a primary page. The Space Apps challenge page could not be fetched (TLS error "unable to get local issuer certificate", reproduced by two fetchers).

## 1. OSDR (GeneLab + ALSDA): what exists and how to access via API

### Takeaway
OSDR (formed 2021 by merging GeneLab and the Ames Life Sciences Data Archive) is the one place with open download and a no-auth REST API. Content is omics-heavy; vitals-like human data is sparse.

### Cited Findings
- OSDR holds omics, physiological, behavioral, hardware and environmental telemetry data; browsing and downloading open-access data needs no login — [SMCE OSDR page](https://smce.nasa.gov/open-science-data-repository-osdr); [Data repository portal login note](https://science.nasa.gov/?p=973089)
- OSDR formed in 2021 by merging ALSDA with GeneLab (so genelab.nasa.gov is legacy branding for OSDR) — [SMCE OSDR page](https://smce.nasa.gov/open-science-data-repository-osdr)
- Biological Data API v2.0.0, base URL `https://visualization.osdr.nasa.gov/biodata/api`, GET only, no auth scheme defined — [API spec](https://visualization.osdr.nasa.gov/biodata/api)
  - `/v2/datasets/` (list), `/v2/dataset/{OSD-id}/` (metadata), `/v2/dataset/{id}/files/`, `/assays/`, `/assay/{name}/samples/`
  - Query endpoints `/v2/query/datasets|assays|samples/` filter by metadata field paths (e.g. `study.characteristics.organism`), `|` = OR; `format=csv|tsv|json.records|json.table|json.split` (plain `json` unsupported)
  - Example: `/v2/dataset/OSD-48/`
- Older OSDR Developer API (full-text search, data-file retrieval, metadata retrieval by accession) is also documented — [OSDR Developer API](https://www.nasa.gov/?p=696974); tutorial at [osdr-tutorials](https://osdr-tutorials.readthedocs.io/en/latest/pages/guides/biological_data_api.html). A nasa.gov result carried a notice of a funding-lapse freeze, so those pages may be stale.
- July 2026 release: 11 new datasets incl. OSD-815 to OSD-818, human ocular analog (ex vivo human translaminar system for SANS: photography, RT-PCR, ERG, histology) — [NASA Data & Software Highlights July 2026](https://science.data.nasa.gov/features-events/data-software-highlights-july-2026)
- OSDR hosts head-down-tilt datasets OSD-680/681, but linked to a rat hindlimb suspension model — [data.gov catalog entry](https://catalog-beta.data.gov/dataset/head-down-tilt-as-a-model-for-intracranial-and-intraocular-pressures-and-retinal-changes-d)
- Main portals: osdr.nasa.gov (UNVERIFIED URL not fetched; referenced in sources above)

### Inferences
- Use `/v2/query/datasets/` filtered on human organism ("Homo sapiens") to enumerate human studies programmatically; scripted ingest is feasible in a hackathon.
- OSDR is best for omics context, not for time-series vitals.

### Gaps
- Exact human-study list and sample counts not enumerated (no API calls were possible via my tools). Recommend the team run the query endpoint first.
- License text for OSDR data not retrieved (NASA data is generally open, but check per-dataset terms).

## 2. LSDA (JSC) and LSAH: public vs restricted

### Takeaway
LSAH individual astronaut medical data is restricted and slow to obtain (many months, IRB, crew consent, data use agreement); it is not hackathon-feasible. Use published aggregates instead.

### Cited Findings
- Request portal: LSDA data request FAQ `lsda.jsc.nasa.gov/Request/DataRequestFAQ` — [NTRS 2018 briefing](https://ntrs.nasa.gov/api/citations/20180004918/downloads/20180004918.pdf)
- Requests need a data request description and justification; individual-level requests must justify why de-identified or grouped data won't do; review covers purpose, merit, attributability, IRB need, consent — [NTRS 2017 workshop deck](https://ntrs.nasa.gov/api/citations/20170009502/downloads/20170009502.pdf)
- Timeline in that deck: scoping up to 6 months, review 2-6 months, IRB 2-4 months, crew consent 1-6 months, DUA/audit 2-3 months — same deck
- Most NASA medical data was collected for clinical care and may lack parameters research needs; LSAH covers astronauts selected since 1959 — same deck
- Attributability review falls under the Common Rule (45 CFR 46) — [NTRS 2018](https://ntrs.nasa.gov/api/citations/20180004918/downloads/20180004918.pdf)

### Inferences
- For the app, LSAH is a citation source (published risk statistics), not a data source.

### Gaps
- No current official step-by-step guide found; the above is from 2017-2018 slides and may be outdated.

## 3. Twins Study, Inspiration4/SOMA, Polaris Dawn, Axiom

### Takeaway
I4/SOMA is the best open spaceflight-human data: 4 civilians, clinical blood panels (CBC, metabolic) plus omics, processed data public, raw genetic data gated. N=4. No open heart-rate/sleep streams found.

### Cited Findings
- I4 data is in OSDR (8 studies; clinical blood assays CBC and metabolic panels plus omics, e.g. OSD-572 skin metagenomics); processed data public, raw sequence data needs an application with board approval — [Sanders et al., npj Microgravity 2024](https://www.nature.com/articles/s41526-024-00393-5.pdf); [PMC11094041](https://pmc.ncbi.nlm.nih.gov/articles/PMC11094041); [NASA I4 datasets news](https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/)
- SOMA portal with browser, pseudobulk, cfRNA and exosome summary downloads, code on GitHub — [SOMA portal](https://soma.weill.cornell.edu); [SOMA Browser](https://soma.weill.cornell.edu/apps/SOMA_Browser)
- SOMA package: 44 publications in Nature, June 2024 — [NASA OSDR SOMA news](https://www.nasa.gov/osdr-latest-news-soma-publications)
- Twins Study: one astronaut over 340 days on ISS plus a ground twin — [Astrobiology summary of Sanders et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC11094041) (data also browsable in SOMA portal per above)
- Programmatic I4 access in OSDR via GLOpenAPI — [Inspiration4 data access paper](https://vivo.weill.cornell.edu/display/pubid38744887)

### Inferences
- Use I4 clinical panels as realistic baseline value ranges and pre/in/post-flight deltas for a synthetic-crew generator; N=4 forbids supervised training.

### Gaps
- Polaris Dawn and Axiom: found no open physiological dataset; not verified either way.
- Whether I4 wearable (HR/sleep) data is released: not confirmed.

## 4. Analog missions (HERA, CHAPEA, NEK, Antarctica, bed rest)

### Takeaway
No open HERA/CHAPEA physiological series found; bed-rest data are mostly via papers or request. One open AGBRESA metabolomics dataset exists.

### Cited Findings
- CHAPEA Mission 1 (378 days, ended 6 July 2024) collected "thousands of data points"; Mission 2 began 19 Oct 2025 — [NASA CHAPEA article](https://www.nasa.gov/missions/voyagers-of-mars-the-first-chapea-crews-yearlong-journey); [Flying Magazine](https://flyingmag.com/news/378-days-of-solitude-nasa-volunteers-emerge-from-mars-simulator). No public release found.
- AGBRESA (2019, DLR/ESA/NASA, 60-day 6° HDT bed rest, 12 participants per campaign): protocol paper [Clement et al. 2022 Front Physiol](https://www.frontiersin.org/articles/10.3389/fphys.2022.976926); open metabolomics/lipidomics dataset (muscle and blood) at [VU Amsterdam Yoda](https://publication.yoda.vu.nl/full/VU01/I9EPPM.html)
- Kramer et al. 2020 report centrifugation countermeasure heart rate findings (paper only) — [DOAJ](https://doaj.org/article/e77b5a6ee9b34360a2c4fcd5f00bfbf4)

### Inferences
- Treat analog papers' reported means/SDs as parameters for synthetic crew simulation rather than expecting raw data.

### Gaps
- HERA, NEK, Antarctic stations (Concordia): not searched successfully; no data found.
- ESA bed rest core data access terms not found.

## 5. Environmental and radiation data

### Takeaway
Radiation instrument data are open and numeric (good for dose-time-series); MARE (Artemis I phantoms) data are not yet confirmed public.

### Cited Findings
- MSL RAD: RDR dataset MSL-M-RAD-3-RDR-V1.0 and EDR MSL-M-RAD-2-EDR-V1.0 at PDS PPI node (UCLA); dose rates in uGy/day from silicon (B) and plastic (E) detectors; last release seen: Release 20, sols 2128-2224 — [RAD RDR SIS](https://pds-ppi.igpp.ucla.edu/volume/MSLRAD_1002/DOCUMENT/RAD_RDR_SIS.HTM)
- ISWA RAD page is quick-look only; official products at SPDF/CDAWeb (MSL_RAD_OBS-L2) and PDS — [ISWA MSLRAD](https://iswa.gsfc.nasa.gov/iswa_data_tree/information/MSLRAD.html)
- Artemis I MARE (Helga and Zohar phantoms; 276 passive detectors from IFJ PAN in Zohar): team said data will be released after analysis; no evidence of release found — [ESA Orion blog](https://blogs.esa.int/orion/?p=12953); [DLR MARE](https://www.dlr.de/en/research-and-transfer/featured-topics/mission-moon/artemis-programme/the-mare-cosmic-radiation-experiment-on-board-artemis-i)
- Space Apps teams report pulling OSDR RadLab and NOAA GOES data — [example repo](https://github.com/fabriciojunio/aurora-astronaut-health) (team claim, not verified)

### Inferences
- MSL RAD gives a Mars-transit/surface dose-rate series to drive a cumulative-dose risk score versus career limits.

### Gaps
- ISS-RAD, DOSIS, CRaTER, OLTARIS, ISS CO2 telemetry: not verified (no source found).

## 6. HRP evidence reports, Human Research Roadmap, NASA-STD-3001

### Takeaway
NASA-STD-3001 Vol 1 (crew health) Rev C (approved 2023-09-15) and Vol 2 (environment) provide numeric limits for rule-based alerts; get exact values from the PDFs.

### Cited Findings
- Vol 1 Rev C PDF — [standards.nasa.gov](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf); supersedes Rev B (Jan 2022) — [Rev B PDF](https://www.nasa.gov/wp-content/uploads/2020/10/2022-01-05_nasa-std-3001_vol.1_rev._b_final_draft_with_signature_010522.pdf)
- Vol 1 sets a career effective-dose limit applying regardless of age/sex; snippets showed "250 mSv" and "600 mSv" but mapping not confirmed — [OCHMO standards overview](https://www.nasa.gov/sites/default/files/atoms/files/ochmo_standards_overview_sept_15_2021_francisco.pdf)
- CO2: 1-hour average ppCO2 under 3 mmHg is a Vol 2 requirement [V2 6004] — [ECLSS technical brief](https://www.nasa.gov/wp-content/uploads/2023/07/eclss-technical-brief-ochmo.pdf)

### Inferences
- Encode limits as config (threshold table) with a citation per rule.

### Gaps
- Bone, aerobic capacity numeric limits, and Human Research Roadmap risk pages (humanresearchroadmap.nasa.gov) were not retrieved.

## 7. Exercise devices, nutrition, sleep, cognition, SANS

### Takeaway
No open raw datasets found for ARED/CEVIS/T2, ISS menus, actigraphy or Cognition battery; SANS has OSDR ocular analog datasets.

### Cited Findings
- SANS: OSD-815 to 818 (see section 1) — [NASA highlights July 2026](https://science.data.nasa.gov/features-events/data-software-highlights-july-2026)
- SANS vs HDT bed rest comparability debated — via [SPACELINE list](https://astrobiology.com/2026/07/13/nasa-spaceline-current-awareness-list-1207-10-july-2026-space-life-science-research-results/)

### Gaps
- Everything else in this question: no sources found; treat as literature-derived parameters only.

## 8. Earth-based proxy datasets

### Takeaway
Use as proxies for training anomaly detectors; verify license on the official pages.

### Cited Findings
- WESAD: 15 subjects, wrist and chest sensors, lab stress study; hosted by Univ. of Siegen — [WESAD](https://www.eti.uni-siegen.de/ubicomp/home/datasets/icmi18/)
- PPG-DaLiA: Empatica E4 plus RespiBAN chest ECG — [arXiv summary](https://arxiv.org/pdf/2510.09764)
- PhysioNet Wearable Device Dataset (stress and structured exercise), Open Data Commons Attribution License v1.0 — [PhysioNet](https://physionet.org/content/wearable-device-dataset/1.0.1/Wearable_Dataset/STRESS/S05/); also [AWS registry](https://registry.opendata.aws/wearable-device-dataset/)

### Gaps
- UNVERIFIED (memory): PPG-DaLiA on UCI ML Repository; MIMIC requires credentialed PhysioNet access with training; WESAD academic-use terms. MIMIC and sleep datasets not searched.

## 9. Space Apps 2026 "Health Monitoring Software" page

### Takeaway
Official resource list could not be retrieved.

### Cited Findings
- Fetch failed with certificate error; searches show many team repos citing spaceflight physiology, radiation exposure and microgravity data — e.g. [AstroByte](https://github.com/meahadi-hasan10/AstroByte-Health-Monitor), [COSMOCare](https://github.com/omkargurav0216-code/COSMOCare)

### Gaps
- Official resource links: need manual read of https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/ in a browser.

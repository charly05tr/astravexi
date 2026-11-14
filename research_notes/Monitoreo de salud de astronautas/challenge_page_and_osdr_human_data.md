# Space Apps 2026 "Health Monitoring Software" challenge page and NASA OSDR human-health data

Method note: a verified-TLS fetch of spaceappschallenge.org failed with every tool allowed (WebFetch: "unable to get local issuer certificate"; Windows curl.exe/Schannel: exit 60; PowerShell Invoke-WebRequest: "no se puede establecer una relacion de confianza"). TLS verification was NOT bypassed. Challenge-page content below is therefore second-hand (search-engine summary, a university local-event page, student GitHub READMEs) and is flagged as such. OSDR APIs (osdr.nasa.gov, visualization.osdr.nasa.gov) were reachable with verified TLS and queried directly on 2026-11-14.

## 1. What does the 2026 "Health Monitoring Software" challenge page say?

### Takeaway
The challenge exists; its official title is "Create Health Monitoring Software for Astronauts on Space Missions". I could not read the page directly, so objectives/considerations are only partly reconstructed; the resource list (5 links) was recovered second-hand from a team README that says it copied "the challenge lists these resources". Treat the five links as likely but not directly verified against the official page.

### Cited Findings
- Official page title (as indexed by search): "Create Health Monitoring Software for Astronauts on Space Missions" — [challenge page](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) (existence/title only, via search listing; page body not read)
- Summary (second-hand, paraphrased by a fetch of a local-event page): task is "build a health monitoring software that gathers health indicators" so astronauts can evaluate and act on their health status — [Sonoma State local event page](https://edeon.sonoma.edu/nasaspaceapps-26/). That page lists no datasets/tools itself.
- Background (same second-hand paraphrase): long-duration missions expose astronauts to space radiation, isolation, altered gravity and a closed/hostile environment; these can contribute to immune changes, bone loss, cardiovascular events and behavioral health problems; on long missions astronauts carry much of the responsibility for spotting changes in themselves — [Sonoma State page](https://edeon.sonoma.edu/nasaspaceapps-26/). Search summary consistent: radiation, isolation and confinement, altered gravity, hostile closed environment — [challenge page via search](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
- Resources the challenge reportedly lists (per a team README: "The challenge lists these resources"): — [Crew-Health-Monitor README](https://github.com/AdityaK0804/Crew-Health-Monitor)
  - NASA five hazards of human spaceflight: https://www.nasa.gov/hrp/hazards/
  - NASA risks of human spaceflight: https://www.nasa.gov/hrp/risks/
  - NASA ongoing HRP research: https://www.nasa.gov/hrp/ongoing-hrp-research/
  - Canadian Space Agency, monitoring radiation / astronaut health: https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp
  - Canadian Space Agency, why science in space: https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp
- Facts that README extracted from those pages (second-hand): bone loss 1-1.5% per month; about 70% of station astronauts show some swelling at the back of the eye; neutrons about 30% of ISS dose; current HRP studies named: Venous Haemostasis, Thigh Cuff, ARCHeR (sleep), Immune Biomarkers, Zero T2 — [Crew-Health-Monitor README](https://github.com/AdityaK0804/Crew-Health-Monitor)
- Event timing: hackathon Nov 14-15, 2026 — [Exterra JSC](https://www.exterrajsc.com/p/registration-opens-for-nov-14-15); the Space Apps 2026 participant terms say events start Nov 14, 2026 (per search summary; terms page not opened).
- Examples of community interpretation (not official): prototypes track resting HR, BP, glucose, temperature, sleep duration, mood — [search summary of GitHub prototypes](https://github.com/mustafadmrkrn/nasaspaceappshealthmonitoring). One team uses OSD-569 CBC values/lab ranges; another OSD-575 CMP — [Crew-Health-Monitor README](https://github.com/AdityaK0804/Crew-Health-Monitor), [nasaspaceappshealthmonitoring README](https://github.com/mustafadmrkrn/nasaspaceappshealthmonitoring).
- Third-party devices/sources cited by a team for realistic sensor sets: ISS BP/ECG kit https://ntrs.nasa.gov/api/citations/20190000238 ; CSA Bio-Monitor smart shirt (ECG, HR, BP, respiration, SpO2, skin temp, activity) https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp ; Actiwatch sleep https://ntrs.nasa.gov/api/citations/20090014820 ; comm delay motivates autonomy https://ntrs.nasa.gov/citations/20240004905 — [nasaspaceappshealthmonitoring README](https://github.com/mustafadmrkrn/nasaspaceappshealthmonitoring)

### Inferences
- The challenge is open-ended and does not appear to supply a dataset; it points to hazard/risk context pages (NASA HRP, CSA), implying judges likely reward correct hazard mapping, clear astronaut-facing evaluation/action guidance, and honest use of real data (OSDR) rather than invented values. This is inference, not a verified judging statement.
- Because 5 resource links are HRP/CSA explanatory pages, any app that links each signal to a named HRP risk (SANS, bone, immune, sleep, behavioral, cardiovascular, radiation) will align well with the page.

### Gaps
- Verbatim objectives, "potential considerations", difficulty/subject tags, and whether a separate "Resources" tab contains NASA/partner datasets: not verified (page unreadable under verified TLS). The listing page https://www.spaceappschallenge.org/2026/challenges/ was also not readable.
- No judging hints could be confirmed. Recommend a human open the page in a browser to copy the Objectives and Considerations text.

## 2. Human-subject studies in NASA OSDR usable for a monitoring app

### Takeaway
OSDR holds ~120 Homo sapiens records via its search API (many are cell lines). Truly human-subject, downloadable-without-application clinical data are essentially the Inspiration4 (I4) studies (4 crew; CBC in OSD-569, CMP in OSD-575) plus omics-only astronaut/analog studies. There is no OSDR dataset with continuous vitals, sleep or cognition time series that I could find; the SANS "OSD-815..818" are ex vivo tissue, not human-subject monitoring.

### Cited Findings
- Query method: `https://osdr.nasa.gov/osdr/data/search?term=<term>&type=cgene&size=N` (term "Homo sapiens" returned 120 hits) and `https://osdr.nasa.gov/osdr/data/osd/meta/<N>`, `.../osd/files/<N>` — [OSDR search API](https://osdr.nasa.gov/osdr/data/search?term=Homo%20sapiens&type=cgene&size=100). Note: `visualization.osdr.nasa.gov/biodata/api/v2/query/metadata/?...format=json` returned "Unsupported format: json" and a csv query timed out (504) — [Biodata API](https://visualization.osdr.nasa.gov/biodata/api/openapi.json).
- Inspiration4 (3-day LEO mission Sept 2021, 4 private astronauts; samples pre-flight L-92, L-44, L-3, post-flight R+1, R+45, R+82, R+194; public release 14-May-2024):
  - OSD-569 Whole blood: RNA-seq, epitranscriptome, WGS, clonal hematopoiesis, Complete Blood Count (Quest Diagnostics test 6399); post-flight includes R+194 — [OSD-569 metadata](https://osdr.nasa.gov/osdr/data/osd/meta/569)
  - OSD-575 Serum: Comprehensive Metabolic Panel (Quest), Eve Technologies immune/cardiac cytokine panels, Alamar NULISA panel; files are tabular CSV, `restricted:false` — [OSD-575 metadata](https://osdr.nasa.gov/osdr/data/osd/meta/575), [OSD-575 file list](https://osdr.nasa.gov/osdr/data/osd/files/575). Note a user team reports OSD-575 has R+1/R+45/R+82/R+194 and that 3 of 4 crew show glucose well below lab range at R+45 — [team README](https://github.com/mustafadmrkrn/nasaspaceappshealthmonitoring) (second-hand).
  - OSD-570 PBMC snRNA/snATAC, TCR/BCR repertoire; OSD-571 plasma proteomics, EVPs, metabolomics, cfDNA/cfRNA; OSD-572 oral/nasal/skin microbial swabs; OSD-573 Dragon capsule swabs; OSD-574 deltoid skin spatial transcriptomics/microbiome; OSD-630 stool metagenome; OSD-687 T-cell histone profiling — [OSDR search "Inspiration4"](https://osdr.nasa.gov/osdr/data/search?term=Inspiration4&type=cgene&size=50)
  - 10 OSD studies in total; clinical assays (CBC, metabolic panels) included; first open-access human commercial spaceflight data released June 2024 — [npj Microgravity data-access guide via PubMed Central listing](https://pmc.ncbi.nlm.nih.gov/articles/PMC11094041), [OSDR spotlight](https://science.data.nasa.gov/learn/blog/osdr-spotlight)
- Axiom-1: OSD-903 (transcription) and OSD-943 (DNA methylation), longitudinal astronaut immune response, released 2025 — [OSDR search "Axiom"](https://osdr.nasa.gov/osdr/data/search?term=Axiom&type=cgene&size=40). OSD-1005 PROMETEO 2 (Ax-3) human cells, not subjects — [OSDR search "astronaut"](https://osdr.nasa.gov/osdr/data/search?term=astronaut&type=cgene&size=100).
- Other astronaut/analog human omics: OSD-53 (astronaut gene expression), OSD-174 (hair follicles, ISS, JAXA), OSD-483/484 (astronaut plasma sEV/exosomes), OSD-481 (lncRNA after spaceflight), OSD-316 (IgM repertoire long-term spaceflight), OSD-353 (plasma proteome incl. real missions and ground analogs), OSD-359 (exhaled breath condensate proteome after long spaceflights), OSD-689 (single-cell, simulated microgravity and spaceflight incl. Twins-related), OSD-280 (astronaut salivary microbiome) — [OSDR search Homo sapiens](https://osdr.nasa.gov/osdr/data/search?term=Homo%20sapiens&type=cgene&size=100), [astronaut search](https://osdr.nasa.gov/osdr/data/search?term=astronaut&type=cgene&size=100)
- Ground analogs: OSD-140 (Mars-520 epigenetics), OSD-542 (14-day confinement, blood gene expression, men), OSD-195 (21-day bed rest muscle), OSD-540 (10-day unilateral lower limb suspension), OSD-51/198/370/942/946 (bed rest muscle) — [OSDR searches](https://osdr.nasa.gov/osdr/data/search?term=bed%20rest&type=cgene&size=40), [confinement](https://osdr.nasa.gov/osdr/data/search?term=confinement&type=cgene&size=40). All are omics (transcriptomics/methylation), not vitals.
- OSD-815..818 are one project "ex vivo human translaminar autonomous system to study SANS pathogenesis" (ex vivo tissue), release date shown 23-Jul-2026 — [OSD-816 metadata](https://osdr.nasa.gov/osdr/data/osd/meta/816); OSD-816 includes electrophysiology but is not human-subject monitoring — [OSDR search "SANS"](https://osdr.nasa.gov/osdr/data/search?term=SANS&type=cgene&size=50).
- OSDR search for "sleep" and "cognitive" returned no human-subject sleep/cognition dataset (cognitive hits were mouse studies OSD-832/833/834) — [sleep search](https://osdr.nasa.gov/osdr/data/search?term=sleep&type=cgene&size=40), [cognitive search](https://osdr.nasa.gov/osdr/data/search?term=cognitive&type=cgene&size=40).
- Access: OSD-575 files show `"restricted": false` (downloadable via the OSDR geode-py download URLs, no application) — [OSD-575 file list](https://osdr.nasa.gov/osdr/data/osd/files/575). I did not check each other study's restriction flag. Individual-level NASA astronaut medical records (LSAH) are a separate, application-based route (not verified here).

### Inferences
- For a monitoring-app demo the only genuinely usable real clinical-chemistry/hematology numbers are I4 CBC (OSD-569) and CMP (OSD-575): 4 subjects, ~7 timepoints, so descriptive display and reference ranges only, no statistics/prediction.
- Vitals, sleep, cognition, and HR/BP time series must be simulated/synthetic or taken from device specs/literature; label them clearly as synthetic.

### Gaps
- Did not confirm subject counts, release dates and restriction flags for each omics study; Twins Study (Garrett-Bakelman) data was not found as a dedicated OSD entry (only OSD-689 matched "Twins").
- Biodata API `/v2/query/datasets/` not successfully used (format error, one timeout); enumeration relied on the OSDR search API.
- SOMA/Axiom-2/other 2025-26 human releases beyond those returned may exist.

## 3. HERA, CHAPEA, ISS radiation dosimetry, ISS CO2

### Takeaway
No public HERA or CHAPEA crew-health dataset was found in OSDR (zero hits for "HERA" and "CHAPEA" in the OSDR search API). Radiation data is the best-supported environmental dataset (OSDR RadLab, ISS RAD/REM/TEPC detectors). ISS cabin CO2 time series: nothing found.

### Cited Findings
- OSDR search for "HERA" and "CHAPEA" returned 0 hits — [HERA query](https://osdr.nasa.gov/osdr/data/search?term=HERA&type=cgene&size=50), [CHAPEA query](https://osdr.nasa.gov/osdr/data/search?term=CHAPEA&type=cgene&size=50).
- HERA standard-measures data are shared with concurrent investigators via data sharing agreements/plans and with others granted retrospective access, i.e. not open download — [NTRS abstract (search result)](https://ntrs.nasa.gov/citations/20220014080); HERA experiment package says investigators must deposit data in the NASA Life Sciences Data Archive — [HRP HERA experiment information package](https://www.nasa.gov/sites/default/files/atoms/files/hrp-hera-experiment-information-package.pdf). Both via search snippets, not fully read.
- CHAPEA: Mission 1 ran 378 days (Jun 25 2023 to Jul 6 2024); a second 378-day crew exited Oct 31 (2025); NASA says data informs Mars planning; no statement of public release found — [NASA](https://www.nasa.gov/missions/voyagers-of-mars-the-first-chapea-crews-yearlong-journey), [Beyond TMRW](https://beyondtmrw.org/article/chapea-mission-2-crew-reflects-after-378-days-on-simulated-mars).
- Radiation: OSDR RadLab portal and RadLab Data API provide ISS RAD, REM and TEPC detector data curated from SRAG — [RadLab portal](https://visualization.osdr.nasa.gov/radlab/), [astrobiology.com summary](https://astrobiology.com/2024/03/03/nasa-open-science-for-life-in-space-the-radlab-portal-radlab-data-api/). OSDR environmental-data page states ISS experiment dosimetry is "being compiled" and BION-M1 dosimetry should not be redistributed without SRAG consultation — [OSDR environmental data](https://www.nasa.gov/reference/osdr-environmental-data). DOSIS: not checked.

### Inferences
- A radiation-exposure widget can use RadLab real data; a "cabin environment" widget (CO2) would have to be synthetic with ISS limits from NASA documents.

### Gaps
- Not verified: RadLab completeness/currency, license/redistribution terms, ISS cabin CO2 public time series, DOSIS public availability, LSAH request process, whether data.nasa.gov hosts HERA/CHAPEA.

## 4. Prior Space Apps projects and ESA/JAXA efforts

### Takeaway
No 2023-2025 global winner clearly matches an astronaut-health monitor/digital twin; the nearest is SpaceGenes+ (2025). ESA and JAXA health monitoring is mostly wearable-based experiments.

### Cited Findings
- 2025 Global Winners announced Dec 18, 2025 from 11,500+ submissions; Team SpaceGenes+ built a dashboard on combined radiation/microgravity molecular effects on astronauts — [NASA announcement](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/) (via search summary). Official winners list: https://www.spaceappschallenge.org/2025/awards/global-winners/ (not read).
- Older entries on astronaut vitals monitoring exist (2018 autonomous monitoring; 2022 smart bracelet "Blueen") — [2022 Blueen](https://2022.spaceappschallenge.org/challenges/2022-challenges/space-biology-superhero/teams/blueen).
- ESA: space medicine team monitors astronauts pre/in/post-flight; the Everywear system (biometric smart shirt, BodyCap e-Tact patch, tonometer with INSERM) was tested on Thomas Pesquet's Proxima mission, data going to a station tablet then to ESA specialists — [ESA "A patch of health"](https://www.esa.int/articles/a-patch-of-health).
- CSA Bio-Monitor (Hexoskin Astroskin) smart shirt has been worn by ESA's Luca Parmitano and JAXA's Aki Hoshide; JAXA astronauts also take part in NASA/JAXA studies such as Immunity Assay — [Space.com](https://www.space.com/43285-astronaut-health-medicine-in-space.html), [NASA ISS blog](https://www.nasa.gov/blogs/spacestation/2025/07/17/human-research-on-station-helping-keep-long-term-crews-healthy/) (via search snippets).

### Inferences
- A differentiator would be a unified hazard-linked view plus a real-data layer (OSD-569/575, RadLab), since prior winners emphasize dashboards.

### Gaps
- No 2023/2024 winners enumerated; no direct JAXA biomedical-monitoring or ESA CMO source opened; digital twin / 3D body projects not found.

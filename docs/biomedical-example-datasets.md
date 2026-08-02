# Biomedical Example Dataset Provenance

Graphitix keeps all built-in examples in `js/shared/exampleDatasets.js`. The registry is immutable at rest and returns a deep clone for every load, so two tabs—even two tabs of the same component—never share mutable example data or Notes state.

Every example populates the component Notes section with the source paper, the relevant published figure or panel, the transformation applied by Graphitix, and whether the visualization is a direct transcription or a derived view. Derived views are identified explicitly and are never presented as digitized copies of published panels.

| Component / mode | Dataset and loaded design | Primary paper | Published figure or panel identified in Notes |
|---|---|---|---|
| Box, single and grouped | Complete ToothGrowth experiment: 60 guinea pigs, two vitamin C delivery methods, three doses | Crampton EW. *J Nutr.* 1947;33:491–504. doi:10.1093/jn/33.5.491 | Figures 1–5 (five unlettered figures) |
| Scatter, 2D / bubble | Diagnosis-balanced 120-case WDBC subset with measured nuclear morphometry | Street WN, Wolberg WH, Mangasarian OL. *Proc SPIE.* 1993;1905:861–870. doi:10.1117/12.148698 | Figure 1; Graphitix plots are documented as derived analyses |
| Scatter, 3D | Three measured cortical protein dimensions across six mouse experimental classes | Higuera et al. *PLoS ONE.* 2015;10:e0129126. doi:10.1371/journal.pone.0129126 | Supplementary Figure 2; Graphitix uses a documented three-protein projection |
| Scatter, grouped / grouped-X | Complete ToothGrowth repeated-animal design | Crampton 1947, above | Figures 1–5 |
| Scatter, volcano / MA | All 30 WDBC features compared between all 212 malignant and 357 benign tumors | Street et al. 1993, above | Figure 1; statistical views are documented as derived analyses |
| PCA, standard and grouped | Six condition means from six cortical protein features, z-standardized across six mouse experimental classes | Higuera et al. 2015, above | Supplementary Figure 2; dimensionality reduction is documented as derived |
| Line, standard / grouped / 3D | All six Indomethacin subjects at all 11 common pharmacokinetic time points | Kwan KC et al. *J Pharmacokinet Biopharm.* 1976;4:255–280. doi:10.1007/BF01063617 | Colby & Bair 2013, Figure 1, six subject concentration-time profiles |
| Heatmap | Thirty z-standardized WDBC features across 40 balanced tumors | Street et al. 1993, above | Figure 1; z-scored heatmap is documented as derived |
| Surface | 15 × 15 Gaussian-kernel local malignancy probability surface over WDBC radius and texture | Street et al. 1993, above | Figure 1; continuous surface is documented as derived |
| ROC | All 113 aSAH verification-cohort patients with paired WFNS, S100B, and NDKA predictors; expected AUCs 0.824, 0.731, and 0.612 with significant paired DeLong differences for WFNS versus each biomarker | Turck N et al. *Intensive Care Med.* 2010;36:107–115. doi:10.1007/s00134-009-1641-y; Robin X et al. *BMC Bioinformatics.* 2011;12:77 | Turck Figure 1 biomarker ROC panels; Robin Figure 3 WFNS ROC example |
| Survival | Complete 23-patient AML preliminary-analysis remission dataset | Embury SH et al. *West J Med.* 1977;126:267–272. PMID:266313 | Figure 1, remission-duration comparison |
| Histogram | All aSAH S100B and NDKA measurements split by six-month outcome | Turck et al. 2010, above | Figure 1 S100β and NDKA panels; Table 2 supplies outcome-stratified distributions |
| Pie | Ten WDBC feature-family contributions computed from all 569 tumors | Street et al. 1993, above | Figure 1; contribution percentages are documented as derived |
| Venn | Curated recurrently altered genes for TCGA Luminal A, Luminal B, and Basal-like tumors | Cancer Genome Atlas Network. *Nature.* 2012;490:61–70. doi:10.1038/nature11412 | Figure 3A–C |

## Data-handling rules

- Source observations remain unchanged unless the Notes explicitly describe a deterministic subset, standardization, statistical comparison, or smoothing transformation.
- Subsets are deterministic and diagnosis-balanced where interactive responsiveness requires fewer samples.
- Paired and repeated-measure designs are preserved in the table schema whenever the component supports them.
- Example Notes are durable tab-owned state and therefore participate in the normal save, reopen, crash-recovery, and tab-isolation contracts.

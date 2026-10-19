// Both original JASSO question images were manually checked. Chapter names alone
// do not establish a comparable whole-question transfer relationship.
export const VERIFIED_PAIRS=Object.freeze([
  {
    ids:['o-2018_2-p10','o-2017_2-p10'],
    subject:'physics',skill:'wave-slope-velocity',
    scope:'右行简谐波：用位移—位置图的斜率判断质点速度方向与最大速度点',
    changedConditions:'纵波改为横波，要求的质点速度由正向改为负向，图中位置与选项改变',
    evidence:[{questionId:'o-2018_2-p10',pdf:'/assets/expanded/2018_2-science.pdf',page:13},{questionId:'o-2017_2-p10',pdf:'/assets/expanded/2017_2-science.pdf',page:13}],
    verifiedBy:'manual-original-image-review',verifiedOn:'2026-10-06'
  },
  {
    ids:['o-2015_2-c1','o-2016_1-c1'],
    subject:'chemistry',skill:'neutral-particle-electron-total',
    scope:'中性原子或分子的总电子数：按组成原子的原子序数求和',
    changedConditions:'更换物质，由找电子总数相同的组合改为找总数不同的一项',
    evidence:[{questionId:'o-2015_2-c1',pdf:'/assets/expanded/2015_2-science.pdf',page:26},{questionId:'o-2016_1-c1',pdf:'/assets/expanded/2016_1-science.pdf',page:26}],
    verifiedBy:'manual-original-image-review',verifiedOn:'2026-10-06'
  }
]);

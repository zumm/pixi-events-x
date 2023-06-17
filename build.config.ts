import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'index',
  ].map(name => `./sources/${name}`),

  outDir: 'build',

  clean: true,
  declaration: true,

  rollup: {
    emitCJS: true,
  },
})

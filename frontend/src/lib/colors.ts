export const colors = {
  primary: {
    900: '#1a3a3a',
    800: '#234e4e',
    700: '#2d6363',
    600: '#357575',
    500: '#3d8888',
    100: '#dceeed',
    50:  '#eef6f5',
  },
  accent: {
    700: '#9a4a2f',
    600: '#b8593a',
    500: '#c96d4f',
    100: '#f5e0d6',
  },
  rank: ['#1a3a3a', '#2d6363', '#5a9e9e', '#a8cec9', '#dceeed'] as const,
  chart: {
    bar: '#2d6363',
  },
} as const

export function getRankColor(rank: number): string {
  if (rank <= 100) return colors.rank[0]
  if (rank <= 200) return colors.rank[1]
  if (rank <= 300) return colors.rank[2]
  if (rank <= 400) return colors.rank[3]
  return colors.rank[4]
}

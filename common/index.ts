export * from './db/index';
export * from './db/schema';

export const getDateTime = (date?: number | Date) => {
  if (!date) return new Date().toISOString().slice(0, 19).replace("T", " ");
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
};

export const maybeBoolean = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return !!int
}

export const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

export const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

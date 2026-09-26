export async function readPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499);
    if (result.error) throw result.error;
    const data = (result.data ?? []) as T[];
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

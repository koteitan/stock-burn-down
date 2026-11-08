export const CATEGORY_LIST_ID = 'category-list';

export function CategoryList({ categories }: { categories: string[] }) {
  return (
    <datalist id={CATEGORY_LIST_ID}>
      {categories
        .filter((c) => c !== '')
        .map((c) => (
          <option key={c} value={c} />
        ))}
    </datalist>
  );
}

export const Type = {
  Object<T extends Record<string, unknown>>(shape: T) {
    return { shape, type: "object" as const };
  },
};

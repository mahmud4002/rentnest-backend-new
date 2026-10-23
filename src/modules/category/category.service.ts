import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.validation';

export const listCategories = () =>
  prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { properties: true } } },
  });

export const createCategory = async (input: CreateCategoryInput) => {
  const duplicate = await prisma.category.findFirst({
    where: { name: { equals: input.name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict(`Category "${input.name}" already exists`, { code: 'CATEGORY_EXISTS' });
  return prisma.category.create({ data: input });
};

export const updateCategory = async (id: string, input: UpdateCategoryInput) => {
  const category = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!category) throw ApiError.notFound('Category not found');

  if (input.name) {
    const duplicate = await prisma.category.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' }, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict(`Category "${input.name}" already exists`, { code: 'CATEGORY_EXISTS' });
  }
  return prisma.category.update({ where: { id }, data: input });
};

export const deleteCategory = async (id: string) => {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { properties: true } } },
  });
  if (!category) throw ApiError.notFound('Category not found');
  if (category._count.properties > 0) {
    throw ApiError.conflict(
      `Cannot delete "${category.name}" because ${category._count.properties} propert${
        category._count.properties === 1 ? 'y uses' : 'ies use'
      } it. Move or remove those properties first.`,
      { code: 'CATEGORY_IN_USE' },
    );
  }
  await prisma.category.delete({ where: { id } });
};

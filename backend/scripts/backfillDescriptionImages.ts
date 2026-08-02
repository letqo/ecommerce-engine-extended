import { prisma } from '../src/config/database'
import { extractDescriptionImages, processDescriptionImages, stripDescriptionImages } from '../src/suppliers/extractDescriptionImages'

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [{ cjProductId: { not: null } }, { aliexpressProductId: { not: null } }],
    },
    include: { images: { orderBy: { sortOrder: 'asc' } } },
  })

  let updated = 0
  for (const product of products) {
    if (!product.description) continue
    const newImages = await processDescriptionImages(extractDescriptionImages(product.description))
    const strippedDescription = stripDescriptionImages(product.description)
    if (newImages.length === 0 && strippedDescription === product.description) continue

    const existingUrls = new Set(product.images.map((img) => img.url))
    const room = Math.max(0, 8 - product.images.length)
    const toAdd = newImages.filter((url) => !existingUrls.has(url)).slice(0, room)
    const nextSortOrder = product.images.length

    await prisma.$transaction([
      prisma.product.update({ where: { id: product.id }, data: { description: strippedDescription } }),
      ...(toAdd.length > 0
        ? [
            prisma.productImage.createMany({
              data: toAdd.map((url, i) => ({ productId: product.id, url, sortOrder: nextSortOrder + i })),
            }),
          ]
        : []),
    ])
    updated++
    console.log(`Updated "${product.title}" (${product.id}): +${toAdd.length} image(s), description cleaned`)
  }

  console.log(`Done. ${updated} product(s) updated out of ${products.length} checked.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

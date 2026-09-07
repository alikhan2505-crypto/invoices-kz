import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://invoices.kz',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://invoices.kz/login',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://invoices.kz/cashier-api',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      // Free no-signup tool -- exists partly as an organic entry point for
      // Kaspi sellers searching for waybill printing, so it belongs here.
      url: 'https://invoices.kz/tools/waybills',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      // Second free no-signup tool, same purpose as the one above: an organic
      // entry point for a Kaspi seller searching for what they actually earn
      // per sale.
      url: 'https://invoices.kz/tools/margin',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://invoices.kz/privacy',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://invoices.kz/terms',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]
}
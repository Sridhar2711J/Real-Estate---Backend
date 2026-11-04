import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding properties into PostgreSQL database...');

  // Find or create a seller
  let seller = await prisma.user.findFirst({
    where: { role: 'seller' },
  });

  if (!seller) {
    console.log('No seller found in database. Please register a seller first.');
    return;
  }

  console.log(`Using seller: ${seller.name} (${seller.email}, ID: ${seller.id})`);

  const count = await prisma.property.count();
  if (count > 0) {
    console.log(`Properties table already contains ${count} properties. Skipping seed.`);
    return;
  }

  const sampleProperties = [
    {
      title: '3 BHK Ultra-Luxury Skyline Apartment in Baner',
      slug: '3-bhk-ultra-luxury-skyline-apartment-baner',
      description: 'Breathtaking 3 BHK luxury apartment situated in the prime high-street vicinity of Baner, Pune. Features panoramic balcony views of the Baner hills, expansive Italian marble living hall, modular German fittings kitchen, smart home automation, and 2 dedicated covered stilt car parking slots.',
      features: ['Modular German Kitchen', 'Italian Marble Flooring', '2 Covered Parkings', 'Smart Home Automation', 'Baner Hill View Deck'],
      price: 16500000,
      propertyType: 'apartment',
      city: 'Pune',
      location: 'Baner',
      address: 'Near Balewadi High Street, Baner',
      bedrooms: 3,
      bathrooms: 3,
      area: 1850,
      coverImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      status: 'active',
      sellerId: seller.id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 1,
            caption: 'Spacious Designer Living Room',
          },
          {
            url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 2,
            caption: 'Exterior Building Architecture & Balconies',
          },
          {
            url: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 3,
            caption: 'Master Bedroom with Wooden Flooring',
          },
        ],
      },
    },
    {
      title: '2 BHK Modern Sunlit Flat in Baner Pashan Link Road',
      slug: '2-bhk-modern-sunlit-flat-baner-pashan',
      description: 'Well-maintained 2 BHK flat for immediate sale. Prime location with excellent cross-ventilation, east-west orientation, modular kitchen cabinets, and spacious dry balcony. Gated society with swimming pool, gym, clubhouse and 24x7 security guard staff.',
      features: ['Pashan Lake Breeze', 'Gated Society', 'Modular Woodwork', 'Covered Parking'],
      price: 9200000,
      propertyType: 'apartment',
      city: 'Pune',
      location: 'Baner',
      address: 'Baner-Pashan Link Road',
      bedrooms: 2,
      bathrooms: 2,
      area: 1100,
      coverImage: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
      status: 'active',
      sellerId: seller.id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 1,
            caption: 'Apartment Hall & Dining',
          },
        ],
      },
    },
    {
      title: '4 BHK Grand Imperial Villa with Private Lawn',
      slug: '4-bhk-grand-imperial-villa-koregaon-park',
      description: 'Exclusive 4 BHK independent luxury villa situated in prime Koregaon Park. Featuring high ceilings, imported marble flooring, landscaped private garden, multi-car driveway, and dedicated servant quarter.',
      features: ['Private Garden', 'Italian Marble', 'Servant Quarter', 'Clubhouse Access', 'Solar Backup'],
      price: 38500000,
      propertyType: 'villa',
      city: 'Pune',
      location: 'Koregaon Park',
      address: 'Lane 7, Koregaon Park',
      bedrooms: 4,
      bathrooms: 5,
      area: 4200,
      coverImage: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
      status: 'active',
      sellerId: seller.id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 1,
            caption: 'Front Villa Elevation',
          },
        ],
      },
    },
  ];

  for (const prop of sampleProperties) {
    const created = await prisma.property.create({
      data: prop,
    });
    console.log(`Created property: "${created.title}" (ID: ${created.id})`);
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding properties:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


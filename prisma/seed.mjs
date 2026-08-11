// JavaScript simple (et non TypeScript) : le seed tourne au démarrage du
// conteneur applicatif, qui n'embarque pas tsx (une devDependency).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EQUIPMENT = [
  {
    category: "Poids du corps",
    items: [
      "Tapis de sol",
      "Barre de traction",
      "Anneaux de gymnastique",
      "Sangles TRX",
      "Chaise romaine",
      "Barres parallèles",
    ],
  },
  {
    category: "Haltères & poids libres",
    items: [
      "Haltères ajustables",
      "Haltères fixes",
      "Kettlebell",
      "Barre olympique",
      "Barre EZ",
      "Disques de poids",
      "Banc plat",
      "Banc inclinable",
      "Rack à squat",
    ],
  },
  {
    category: "Machines",
    items: [
      "Presse à cuisses",
      "Poulie / câbles",
      "Poulie vis-à-vis (crossover)",
      "Tirage vertical (lat pulldown)",
      "Rowing machine assis",
      "Rowing T-bar",
      "Machine pectoraux (butterfly)",
      "Développé couché machine (chest press)",
      "Leg extension",
      "Leg curl",
      "Smith machine",
      "Hack squat",
      "Machine à mollets",
      "Presse à épaules",
      "Machine adducteurs / abducteurs",
      "Curl pupitre (larry scott)",
      "Banc à lombaires (hyperextension)",
      "Station à dips",
    ],
  },
  {
    category: "Cardio",
    items: [
      "Tapis de course",
      "Vélo d'appartement",
      "Rameur",
      "Vélo elliptique",
      "Corde à sauter",
      "Escalier (stairmaster)",
      "Assault bike",
    ],
  },
  {
    category: "Accessoires",
    items: [
      "Élastiques de résistance",
      "Medecine ball",
      "Roue abdominale",
      "Corde ondulatoire (battle rope)",
      "Gilet lesté",
      "Box de saut (plyo box)",
      "Swiss ball",
    ],
  },
];

// Muscles prédéfinis, au niveau anatomique (faisceaux/zones) : l'IA est
// instruite de viser le niveau le plus précis ; les groupes généraux restent
// pour les exercices globaux et la compatibilité des anciens programmes.
// L'IA peut créer d'autres muscles à la volée ; les images ne sont jamais
// générées au seed (npm run images:generate -- --muscles).
const MUSCLES = [
  // Dos
  "Dos",
  "Grand dorsal",
  "Trapèzes",
  "Rhomboïdes",
  "Grand rond",
  "Lombaires",
  // Pectoraux
  "Pectoraux",
  "Pectoraux (haut)",
  "Pectoraux (milieu)",
  "Pectoraux (bas)",
  // Épaules
  "Épaules",
  "Deltoïde antérieur",
  "Deltoïde latéral",
  "Deltoïde postérieur",
  // Bras
  "Biceps",
  "Triceps",
  "Avant-bras",
  // Tronc
  "Abdominaux",
  "Abdominaux (haut)",
  "Abdominaux (bas)",
  "Obliques",
  "Transverse",
  // Jambes
  "Quadriceps",
  "Ischio-jambiers",
  "Fessiers",
  "Grand fessier",
  "Moyen fessier",
  "Adducteurs",
  "Mollets",
  // Divers
  "Cardio",
];

async function main() {
  // Seul le catalogue d'équipements est seedé : les contextes
  // d'entraînement (Maison, Gym X…) sont créés par l'utilisateur.
  for (const group of EQUIPMENT) {
    for (const name of group.items) {
      await prisma.equipment.upsert({
        where: { name },
        update: { category: group.category },
        create: { name, category: group.category },
      });
    }
  }

  for (const name of MUSCLES) {
    await prisma.muscle.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  console.log("Seed terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

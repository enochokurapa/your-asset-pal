export type GeographyOption = {
  code: string;
  name: string;
  areas: Record<string, string[]>;
};

export const PESAPAL_COUNTRIES: GeographyOption[] = [
  {
    code: "UG",
    name: "Uganda",
    areas: {
      Kampala: ["Bugolobi", "Nakawa", "Ntinda", "Naguru", "Kololo", "Nakasero", "Kawempe", "Makindye", "Rubaga", "Luzira", "Muyenga"],
      Jinja: ["Jinja Central", "Walukuba", "Masese", "Bugembe", "Mpumudde"],
      Wakiso: ["Entebbe", "Kira", "Nansana", "Kajjansi", "Kyanja", "Namugongo"],
      Mbarara: ["Mbarara City", "Nyamitanga", "Kakoba", "Kamukuzi"],
      Gulu: ["Gulu City", "Laroo", "Layibi", "Bardege"],
    },
  },
  {
    code: "KE",
    name: "Kenya",
    areas: {
      Nairobi: ["Westlands", "Kilimani", "Upper Hill", "Industrial Area", "Karen", "Lavington", "CBD", "Parklands"],
      Mombasa: ["Nyali", "Mombasa Island", "Likoni", "Changamwe"],
      Kisumu: ["Kisumu Central", "Milimani", "Mamboleo"],
      Nakuru: ["Nakuru CBD", "Milimani", "Lanet"],
      Eldoret: ["Eldoret CBD", "Kapsoya", "Elgon View"],
    },
  },
  {
    code: "TZ",
    name: "Tanzania",
    areas: {
      "Dar es Salaam": ["Masaki", "Oyster Bay", "Mikocheni", "Kariakoo", "Kinondoni", "Ilala", "Temeke"],
      Arusha: ["Arusha CBD", "Sakina", "Njiro", "Kijenge"],
      Zanzibar: ["Stone Town", "Mlandege", "Kiembe Samaki"],
      Mwanza: ["Mwanza Central", "Nyamagana", "Ilemela"],
    },
  },
  {
    code: "RW",
    name: "Rwanda",
    areas: {
      Kigali: ["Remera", "Kacyiru", "Kimihurura", "Nyarutarama", "Kicukiro", "Nyamirambo"],
      Musanze: ["Musanze Town"],
      Rubavu: ["Gisenyi"],
      Huye: ["Huye Town"],
    },
  },
  {
    code: "ZM",
    name: "Zambia",
    areas: {
      Lusaka: ["Lusaka CBD", "Kabulonga", "Woodlands", "Roma", "Chilenje", "Industrial Area"],
      Kitwe: ["Kitwe Central", "Parklands"],
      Ndola: ["Ndola Central", "Kansenshi"],
      Livingstone: ["Livingstone Central"],
    },
  },
  {
    code: "MW",
    name: "Malawi",
    areas: {
      Lilongwe: ["City Centre", "Area 3", "Area 10", "Area 18", "Kanengo"],
      Blantyre: ["Blantyre CBD", "Limbe", "Namiwawa"],
      Mzuzu: ["Mzuzu Central"],
      Zomba: ["Zomba Central"],
    },
  },
  {
    code: "ZW",
    name: "Zimbabwe",
    areas: {
      Harare: ["Harare CBD", "Avondale", "Borrowdale", "Eastlea", "Msasa", "Belgravia"],
      Bulawayo: ["Bulawayo CBD", "Suburbs", "Belmont"],
      Mutare: ["Mutare Central"],
      Gweru: ["Gweru Central"],
    },
  },
];

export function countryByCode(code?: string | null) {
  return PESAPAL_COUNTRIES.find((country) => country.code === code);
}

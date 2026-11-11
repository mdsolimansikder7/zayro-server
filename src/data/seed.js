const { Product, PromoCode, Storefront } = require("../models");

const description =
  "Crafted from a soft and breathable fabric, this piece offers superior comfort and style. Perfect for everyday wear and easy to pair with anything in your wardrobe.";
const colors = ["#4F4631", "#314F4A", "#31344F"];
const sizes = ["Small", "Medium", "Large", "X-Large"];

const catalog = [
  ["t-shirt-with-tape-details", "T-shirt with Tape Details", "tshirt-tape.png", 120, null, null, "new", "T-Shirts", description, 4.5],
  ["skinny-fit-jeans", "Skinny Fit Jeans", "skinny-jeans.png", 240, 260, 20, "new", "Jeans", description, 3.5],
  ["checkered-shirt", "Checkered Shirt", "checkered-shirt.png", 180, null, null, "new", "Shirts", description, 4.5],
  ["sleeve-striped-t-shirt", "Sleeve Striped T-shirt", "sleeve-striped-tee.png", 130, 160, 30, "new", "T-Shirts", description, 4.5],
  ["vertical-striped-shirt", "Vertical Striped Shirt", "vertical-striped-shirt.png", 212, 232, 20, "top", "Shirts", description, 5],
  ["courage-graphic-t-shirt", "Courage Graphic T-shirt", "courage-graphic-tee.png", 145, null, null, "top", "T-Shirts", description, 4],
  ["loose-fit-bermuda-shorts", "Loose Fit Bermuda Shorts", "bermuda-shorts.png", 80, null, null, "top", "Shorts", description, 3],
  ["faded-skinny-jeans", "Faded Skinny Jeans", "faded-skinny-jeans.png", 210, null, null, "top", "Jeans", description, 4.5],
  ["one-life-graphic-t-shirt", "One Life Graphic T-shirt", "one-life-main.png", 260, 300, 40, "detail", "T-Shirts", "This graphic t-shirt is perfect for any occasion. Crafted from a soft and breathable fabric, it offers superior comfort and style.", 4.5, ["one-life-main.png", "one-life-t2.png", "one-life-t3.png"]],
  ["polo-with-contrast-trims", "Polo with Contrast Trims", "polo-contrast-trims.png", 212, 242, 20, "related", "Shirts", description, 4],
  ["gradient-graphic-t-shirt", "Gradient Graphic T-shirt", "gradient-graphic-tee.png", 145, null, null, "related", "T-Shirts", description, 3.5],
  ["polo-with-tipping-details", "Polo with Tipping Details", "polo-tipping.png", 180, null, null, "related", "Shirts", description, 4.5],
  ["black-striped-t-shirt", "Black Striped T-shirt", "black-striped-tee.png", 120, 160, 30, "related", "T-Shirts", description, 5],
];

async function seedCatalog() {
  if ((await Product.estimatedDocumentCount()) === 0) {
    await Product.insertMany(
      catalog.map(([slug, title, imageFile, price, oldPrice, discount, collection, category, text, rating, imageFiles]) => {
        const image = `/products/${imageFile}`;
        return {
          slug,
          title,
          image,
          images: imageFiles ? imageFiles.map((file) => `/products/${file}`) : [image],
          price,
          oldPrice,
          discount,
          collectionName: collection,
          category,
          styles: ["Casual"],
          description: text,
          rating,
          colors,
          sizes,
        };
      }),
    );
  }

  await PromoCode.updateOne(
    { code: "WELCOME10" },
    { $setOnInsert: { type: "percent", value: 10, minimumSubtotal: 50, active: true } },
    { upsert: true },
  );
  await PromoCode.updateOne(
    { code: "ZAYRO20" },
    { $setOnInsert: { type: "percent", value: 20, minimumSubtotal: 100, active: true } },
    { upsert: true },
  );
  await Storefront.updateOne(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        heroStats: [
          { value: "200+", label: "International Brands" },
          { value: "2,000+", label: "High-Quality Products" },
          { value: "30,000+", label: "Happy Customers" },
        ],
        brands: [
          { name: "VERSACE", style: "serif" },
          { name: "ZARA", style: "serif-bold" },
          { name: "GUCCI", style: "serif" },
          { name: "PRADA", style: "serif" },
          { name: "Calvin Klein", style: "sans" },
        ],
        navigation: [
          { label: "Shop", href: "/category/casual" },
          { label: "On Sale", href: "/category/casual?sort=price_asc" },
          { label: "New Arrivals", href: "/category/casual?collection=new" },
          { label: "Brands", href: "/category/casual" },
        ],
        faqs: [
          { question: "How long does delivery take?", answer: "Usually 3-5 working days inside the city and 5-7 days outside." },
          { question: "Can I return the product?", answer: "Yes, you can return it within 7 days if the tag is still attached." },
          { question: "Which size should I choose?", answer: "Our sizes run true to size. If you are between two sizes, pick the larger one." },
        ],
        socialLinks: [
          { name: "X", url: "#" },
          { name: "Facebook", url: "#" },
          { name: "Instagram", url: "#" },
        ],
        companyLinks: [
          { label: "About", url: "/#about" },
          { label: "Features", url: "/#features" },
          { label: "Works", url: "/#works" },
          { label: "Career", url: "/#career" },
        ],
        helpLinks: [
          { label: "Customer Support", url: "/#support" },
          { label: "Delivery Details", url: "/#delivery" },
          { label: "Terms & Conditions", url: "/#terms" },
          { label: "Privacy Policy", url: "/#privacy" },
        ],
        faqLinks: [
          { label: "Account", url: "/profile" },
          { label: "Manage Deliveries", url: "/profile" },
          { label: "Orders", url: "/profile" },
          { label: "Payments", url: "/#payments" },
        ],
        paymentMethods: ["bKash", "Nagad", "Rocket", "Visa", "Mastercard"],
        brandDescription: "We have clothes that suit your style and which you're proud to wear. From women to men.",
        copyrightText: "Zayro ©2026. All Rights Reserved",
        hero: {
          title: "Find clothes that match your style",
          description: "Browse through our diverse range of meticulously crafted garments, designed to bring out your individuality and cater to your sense of style.",
          ctaLabel: "Shop Now",
          ctaUrl: "/category/casual",
          image: "/hero.png",
        },
        dressStyles: [
          { name: "Casual", image: "/styles/casual.png", span: "lg:col-span-5", flip: true },
          { name: "Formal", image: "/styles/formal.png", span: "lg:col-span-7", flip: true },
          { name: "Party", image: "/styles/party.png", span: "lg:col-span-7", flip: false },
          { name: "Gym", image: "/styles/gym.png", span: "lg:col-span-5", flip: false },
        ],
        announcement: {
          text: "Sign up and get 20% off to your first order.",
          linkText: "Sign Up Now",
          linkUrl: "/sign-up",
        },
        shipping: {
          deliveryFee: 15,
          freeOver: null,
          returnWindowDays: 7,
          cityDeliveryDays: "3-5 working days",
          otherDeliveryDays: "5-7 working days",
        },
      },
    },
    { upsert: true },
  );
  await Storefront.updateOne(
    { key: "default", navigation: { $exists: false } },
    {
      $set: {
        navigation: [
          { label: "Shop", href: "/category/casual" },
          { label: "On Sale", href: "/category/casual?sort=price_asc" },
          { label: "New Arrivals", href: "/category/casual?collection=new" },
          { label: "Brands", href: "/category/casual" },
        ],
      },
    },
  );
}

module.exports = { seedCatalog };

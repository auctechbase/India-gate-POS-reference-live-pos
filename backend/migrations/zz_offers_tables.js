// Offers (promotions): "buy 2 get 1 free", "buy 2 get 20% off", "buy 3 get €2 off", "3 for €5".
// Only adds two tables; nothing existing changes. Named "zz_" so it runs last on a fresh install.
exports.up = async function (knex) {
    if (!(await knex.schema.hasTable('offers'))) {
        await knex.schema.createTable('offers', (table) => {
            table.increments('id');
            table.string('name', 120).notNullable();
            // free_items | percent_off | amount_off | bundle_price
            table.string('type', 20).notNullable();
            table.integer('buy_quantity').notNullable();
            table.integer('free_quantity').nullable();
            // percent for percent_off; money for amount_off and bundle_price
            table.decimal('value', 10, 2).nullable();
            table.string('starts_on', 10).nullable(); // YYYY-MM-DD, shop-local; null = no limit
            table.string('ends_on', 10).nullable(); // last day the offer runs
            table.boolean('active').notNullable().defaultTo(true);
            table.boolean('show_on_customer_screen').notNullable().defaultTo(false);
            table.string('headline', 120).nullable();
            table.timestamps(true, true);
        });
    }
    // What an offer covers: single products and/or whole categories (one of the two per row).
    if (!(await knex.schema.hasTable('offer_items'))) {
        await knex.schema.createTable('offer_items', (table) => {
            table.increments('id');
            table.integer('offer_id').unsigned().notNullable().index();
            table.bigInteger('product_id').nullable().index();
            table.bigInteger('category_id').nullable().index();
        });
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('offer_items');
    await knex.schema.dropTableIfExists('offers');
};

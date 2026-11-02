// Creates `products` with its current columns (`deleted` included, see
// add_deleted_to_products_table.js which runs before this file on a fresh install).
exports.up = async function (knex) {
    if (await knex.schema.hasTable('products')) return;
    await knex.schema.createTable('products', (table) => {
        table.increments('id').primary(); // Auto-incrementing ID
        table.string('name').notNullable().index();
        table.string('image').nullable();
        table.bigInteger('category_id').nullable().index();
        table.string('type').nullable();
        table.string('price').notNullable().index();
        table.string('weight').nullable();
        table.string('unit').nullable();
        table.string('quantity').defaultTo(20).nullable().index();
        table.boolean('pos').defaultTo(true);
        table.longText('sales_desc').nullable();
        table.string('tax').nullable();
        table.string('code').nullable().index();
        table.boolean('deleted').defaultTo(false);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('products');
};

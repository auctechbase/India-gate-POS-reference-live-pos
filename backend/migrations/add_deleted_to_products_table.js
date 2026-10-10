// On a fresh install this runs before `products.js`, which then creates the column itself.
exports.up = async function (knex) {
    if (!(await knex.schema.hasTable('products'))) return;
    if (await knex.schema.hasColumn('products', 'deleted')) return;
    await knex.schema.table('products', table => table.boolean('deleted').defaultTo(false));
};

exports.down = async function (knex) {
    await knex.schema.table('products', table => table.dropColumn('deleted'));
};

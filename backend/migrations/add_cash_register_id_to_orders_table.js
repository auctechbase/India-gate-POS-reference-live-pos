// On a fresh install this runs before `orders_table.js`, which then creates the column itself.
exports.up = async function (knex) {
    if (!(await knex.schema.hasTable('orders'))) return;
    if (await knex.schema.hasColumn('orders', 'cash_register_id')) return;
    await knex.schema.table('orders', table => table.bigInteger('cash_register_id').nullable());
};

exports.down = async function (knex) {
    await knex.schema.table('orders', table => table.dropColumn('cash_register_id'));
};

// The toggle routes used to save the URL text 'true' / 'false' into boolean columns, while
// the lists filter on `= 1`. Rows saved that way vanished from the POS / category / tax lists.
// Named "zz_" so it runs after every create-table migration on a fresh install.
const COLUMNS = [
    ['products', 'pos'],
    ['product_categories', 'status'],
    ['taxes', 'status'],
];

exports.up = async function (knex) {
    for (const [table, column] of COLUMNS) {
        if (!(await knex.schema.hasTable(table))) continue;
        await knex(table).whereIn(column, ['true', '1']).update({ [column]: 1 });
        await knex(table).whereIn(column, ['false', '0', '']).update({ [column]: 0 });
    }
};

exports.down = async function () {};

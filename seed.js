const { randomUUID } = require('crypto');
const db = require('./db');

const templateNames = [
  'Açucar', 'Álcool', 'Alface', 'Alho', 'Apresuntado',
  'Atum chicharro', 'Atum Gomes', 'Azeite', 'Azeitonas', 'Bacon',
  'Banana', 'Barbecue', 'Batata Palha', 'Bobina', 'Bobina fração',
  'Brócolis', 'Bucha', 'Búfala', 'Caixa broto', 'Calabresa',
  'Caldo de galinha', 'Caldo de legumes', 'Cândida', 'Canela em pó', 'Carne seca',
  'Cebola', 'Cebolinha', 'Cerveja', 'Champignon', 'Chocolate ao leite',
  'Chocolate branco', 'Coca cola', 'Coca cola zero', 'Coca cola 600ml', 'Coca cola Lata',
  'Coco ralado', 'Colorau', 'Copo descartável', 'Costela', 'Crean chesse',
  'Creme de leite', 'Dell vale manga', 'Dell valle pêssego', 'Dell valle uva', 'Desinfetante',
  'Detergente', 'Doce de leite', 'Dolly', 'Ervilha', 'Escarola',
  'Etiquetas', 'Fanta laranja', 'Fanta uva', 'Farinha', 'Fermento',
  'Fubá', 'Gergelim', 'Goiabada', 'Gorgonzola', 'Granulado',
  'Guaraná Antártica', 'Guaraná Lata', 'Hamburguer', 'Heineken', 'Ketchup',
  'Kuat', 'Leite condensado', 'Leite ninho', 'Limpa Forno', 'Lombo',
  'Luva de limpeza', 'Luva manipulação', 'Luva G', 'Luva P', 'Margarina',
  'Milho', 'MMs', 'Molho', 'Morango', 'Mussarela',
  'Nutella', 'Óleo', 'Orégano', 'Ovos', 'Paçoca',
  'Palmito', 'Papel Higiênico', 'Papel toalha', 'Parmesão', 'Peito de Peru',
  'Pepperoni', 'Perflex', 'Pimenta', 'Pimenta biquinho', 'Provolone',
  'Requeijão (borda)', 'Requeijão (cheddar)', 'Requeijão (scala)', 'Rucula', 'Sabão liquido',
  'Saco de lixo 100L', 'Saco de lixo 60L', 'Sal', 'Salame', 'Salsicha',
  'Saquinho', 'Sassami (frango)', 'Skool', 'Sprit', 'Suporte Pizza',
  'Tarê', 'Tomate', 'Tomate seco', 'Vinho santome', 'Vinho pérgola',
];

const stockItems = [
  { name: 'Açucar',           qty: 1,  unit: 'fardo' },
  { name: 'Álcool',           qty: 2,  unit: 'un'    },
  { name: 'Alface',           qty: 2,  unit: 'un'    },
  { name: 'Alho',             qty: 2,  unit: 'pct'   },
  { name: 'Apresuntado',      qty: 2,  unit: 'un'    },
  { name: 'Atum chicharro',   qty: 10, unit: 'un'    },
  { name: 'Atum Gomes',       qty: 6,  unit: 'un'    },
  { name: 'Azeite',           qty: 1,  unit: 'un'    },
  { name: 'Azeitonas',        qty: 5,  unit: 'un'    },
  { name: 'Bacon',            qty: 6,  unit: 'un'    },
  { name: 'Banana',           qty: 2,  unit: 'dz'    },
  { name: 'Barbecue',         qty: 1,  unit: 'un'    },
  { name: 'Batata Palha',     qty: 2,  unit: 'un'    },
  { name: 'Bobina',           qty: 4,  unit: 'un'    },
  { name: 'Bobina fração',    qty: 1,  unit: 'un'    },
  { name: 'Brócolis',         qty: 5,  unit: 'un'    },
  { name: 'Bucha',            qty: 0,  unit: 'un'    },
  { name: 'Búfala',           qty: 1,  unit: 'un'    },
  { name: 'Caixa broto',      qty: 4,  unit: 'cx'    },
  { name: 'Calabresa',        qty: 5,  unit: 'cx'    },
  { name: 'Caldo de galinha', qty: 2,  unit: 'un'    },
  { name: 'Caldo de legumes', qty: 1,  unit: 'un'    },
  { name: 'Cândida',          qty: 2,  unit: 'un'    },
  { name: 'Canela em pó',     qty: 1,  unit: 'un'    },
  { name: 'Carne seca',       qty: 5,  unit: 'un'    },
  { name: 'Cebola',           qty: 1,  unit: 'pct'   },
  { name: 'Cebolinha',        qty: 1,  unit: 'un'    },
  { name: 'Cerveja',          qty: 10, unit: 'un'    },
  { name: 'Champignon',       qty: 2,  unit: 'un'    },
  { name: 'Chocolate ao leite', qty: 2, unit: 'cx'   },
  { name: 'Chocolate branco', qty: 1,  unit: 'cx'    },
  { name: 'Coca cola',        qty: 5,  unit: 'un'    },
  { name: 'Coca cola zero',   qty: 6,  unit: 'un'    },
  { name: 'Coca cola 600ml',  qty: 4,  unit: 'un'    },
  { name: 'Coca cola Lata',   qty: 10, unit: 'un'    },
  { name: 'Coco ralado',      qty: 2,  unit: 'un'    },
  { name: 'Colorau',          qty: 1,  unit: 'un'    },
  { name: 'Copo descartável', qty: 1,  unit: 'un'    },
  { name: 'Costela',          qty: 5,  unit: 'un'    },
  { name: 'Crean chesse',     qty: 1,  unit: 'un'    },
  { name: 'Creme de leite',   qty: 10, unit: 'un'    },
  { name: 'Dell vale manga',  qty: 3,  unit: 'un'    },
  { name: 'Dell valle pêssego', qty: 3, unit: 'un'   },
  { name: 'Dell valle uva',   qty: 6,  unit: 'un'    },
  { name: 'Desinfetante',     qty: 2,  unit: 'un'    },
  { name: 'Detergente',       qty: 4,  unit: 'un'    },
  { name: 'Doce de leite',    qty: 10, unit: 'un'    },
  { name: 'Dolly',            qty: 3,  unit: 'un'    },
  { name: 'Ervilha',          qty: 3,  unit: 'un'    },
  { name: 'Escarola',         qty: 1,  unit: 'un'    },
  { name: 'Etiquetas',        qty: 1,  unit: 'un'    },
  { name: 'Fanta laranja',    qty: 1,  unit: 'un'    },
  { name: 'Fanta uva',        qty: 1,  unit: 'un'    },
  { name: 'Farinha',          qty: 3,  unit: 'un'    },
  { name: 'Fermento',         qty: 10, unit: 'un'    },
  { name: 'Fubá',             qty: 1,  unit: 'un'    },
  { name: 'Gergelim',         qty: 1,  unit: 'un'    },
  { name: 'Goiabada',         qty: 2,  unit: 'un'    },
  { name: 'Gorgonzola',       qty: 1,  unit: 'un'    },
  { name: 'Granulado',        qty: 1,  unit: 'pct'   },
  { name: 'Guaraná Antártica', qty: 1, unit: 'un'    },
  { name: 'Guaraná Lata',     qty: 10, unit: 'un'    },
  { name: 'Hamburguer',       qty: 1,  unit: 'cx'    },
  { name: 'Heineken',         qty: 1,  unit: 'un'    },
  { name: 'Ketchup',          qty: 1,  unit: 'un'    },
  { name: 'Kuat',             qty: 1,  unit: 'un'    },
  { name: 'Leite condensado', qty: 5,  unit: 'un'    },
  { name: 'Leite ninho',      qty: 1,  unit: 'un'    },
  { name: 'Limpa Forno',      qty: 2,  unit: 'un'    },
  { name: 'Lombo',            qty: 3,  unit: 'un'    },
  { name: 'Luva de limpeza',  qty: 2,  unit: 'un'    },
  { name: 'Luva manipulação', qty: 1,  unit: 'cx'    },
  { name: 'Luva G',           qty: 1,  unit: 'un'    },
  { name: 'Luva P',           qty: 1,  unit: 'un'    },
  { name: 'Margarina',        qty: 1,  unit: 'un'    },
  { name: 'Milho',            qty: 4,  unit: 'un'    },
  { name: 'MMs',              qty: 1,  unit: 'un'    },
  { name: 'Molho',            qty: 15, unit: 'un'    },
  { name: 'Morango',          qty: 2,  unit: 'cx'    },
  { name: 'Mussarela',        qty: 3,  unit: 'cx'    },
  { name: 'Nutella',          qty: 1,  unit: 'un'    },
  { name: 'Óleo',             qty: 10, unit: 'un'    },
  { name: 'Orégano',          qty: 1,  unit: 'pct'   },
  { name: 'Ovos',             qty: 5,  unit: 'cx'    },
  { name: 'Paçoca',           qty: 1,  unit: 'pct'   },
  { name: 'Palmito',          qty: 2,  unit: 'un'    },
  { name: 'Papel Higiênico',  qty: 5,  unit: 'un'    },
  { name: 'Papel toalha',     qty: 5,  unit: 'un'    },
  { name: 'Parmesão',         qty: 1,  unit: 'un'    },
  { name: 'Peito de Peru',    qty: 2,  unit: 'un'    },
  { name: 'Pepperoni',        qty: 1,  unit: 'cx'    },
  { name: 'Perflex',          qty: 1,  unit: 'un'    },
  { name: 'Pimenta',          qty: 1,  unit: 'un'    },
  { name: 'Pimenta biquinho', qty: 1,  unit: 'un'    },
  { name: 'Provolone',        qty: 2,  unit: 'un'    },
  { name: 'Requeijão (borda)', qty: 24, unit: 'un'   },
  { name: 'Requeijão (cheddar)', qty: 12, unit: 'un' },
  { name: 'Requeijão (scala)', qty: 24, unit: 'un'   },
  { name: 'Rucula',           qty: 1,  unit: 'un'    },
  { name: 'Sabão liquido',    qty: 1,  unit: 'un'    },
  { name: 'Saco de lixo 100L', qty: 20, unit: 'un'   },
  { name: 'Saco de lixo 60L', qty: 10, unit: 'un'    },
  { name: 'Sal',              qty: 1,  unit: 'fardo'  },
  { name: 'Salame',           qty: 3,  unit: 'un'    },
  { name: 'Salsicha',         qty: 5,  unit: 'pct'   },
  { name: 'Saquinho',         qty: 5,  unit: 'un'    },
  { name: 'Sassami (frango)', qty: 1,  unit: 'cx'    },
  { name: 'Skool',            qty: 10, unit: 'un'    },
  { name: 'Sprit',            qty: 1,  unit: 'un'    },
  { name: 'Suporte Pizza',    qty: 3,  unit: 'pct'   },
  { name: 'Tarê',             qty: 1,  unit: 'un'    },
  { name: 'Tomate',           qty: 1,  unit: 'cx'    },
  { name: 'Tomate seco',      qty: 1,  unit: 'un'    },
  { name: 'Vinho santome',    qty: 2,  unit: 'un'    },
  { name: 'Vinho pérgola',    qty: 2,  unit: 'un'    },
];

const tmplCount = db.prepare('SELECT COUNT(*) as n FROM template_items').get().n;
if (tmplCount > 0) {
  console.log(`template_items já tem ${tmplCount} itens — pulando.`);
} else {
  const ins = db.prepare(
    'INSERT INTO template_items (id, name, qty, unit, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    templateNames.forEach((name, i) => ins.run(randomUUID(), name, 1, 'un', i));
  })();
  console.log(`Inseridos ${templateNames.length} itens na lista padrão.`);
}

const stockCount = db.prepare('SELECT COUNT(*) as n FROM stock_items').get().n;
if (stockCount > 0) {
  console.log(`stock_items já tem ${stockCount} itens — pulando.`);
} else {
  const ins = db.prepare(
    'INSERT INTO stock_items (id, name, qty, unit, min_qty) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    stockItems.forEach(item => ins.run(randomUUID(), item.name, item.qty, item.unit, 0));
  })();
  console.log(`Inseridos ${stockItems.length} itens no estoque.`);
}

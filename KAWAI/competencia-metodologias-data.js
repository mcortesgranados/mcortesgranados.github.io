window.kawaiiCompetitorMethodologies = {
  order: [
    "porter",
    "pestel",
    "bcg",
    "ansoff",
    "oceano-azul",
    "jtbd",
    "journey",
    "value-proposition",
    "kraljic",
    "kano"
  ],
  commonSources: [
    {
      label: "Kunikolor",
      url: "https://kunikolor.com/",
      note: "Tienda online de papeleria kawaii con contacto en Bogota, Cundinamarca y colecciones como Sanrio, gatos y huellitas."
    },
    {
      label: "Gaman Papeleria",
      url: "https://gamanpapeleria.com.co/",
      note: "Competidor local que se posiciona como papeleria kawaii en Bogota; declara envios dentro de Bogota."
    },
    {
      label: "Raya & Papel",
      url: "https://www.rayaypapel.com/",
      note: "Tienda de papeleria kawaii con cobertura comunicada para Bogota y Colombia."
    },
    {
      label: "Panamericana",
      url: "https://www.panamericana.com.co/",
      note: "Cadena tradicional de libreria y papeleria con tienda virtual y presencia fuerte en Bogota."
    },
    {
      label: "Mercado Libre Colombia",
      url: "https://listado.mercadolibre.com.co/papeleria-kawaii",
      note: "Marketplace con miles de resultados de papeleria kawaii, precios visibles y entregas rapidas en Colombia."
    },
    {
      label: "Falabella Colombia",
      url: "https://www.falabella.com.co/falabella-co/shop/papeleria-kawaii",
      note: "Marketplace con productos de papeleria kawaii vendidos por terceros como Bocetos Papeleria y Bocetos Distribuciones."
    },
    {
      label: "SHEIN Colombia",
      url: "https://www.shein.com.co/Kawai-stickers-store-4082426764.html",
      note: "Sustituto internacional de bajo precio para stickers, adhesivos y material escolar/oficina."
    },
    {
      label: "Temu",
      url: "https://www.temu.com/kawaii-stationery-supplies-s.html",
      note: "Sustituto internacional con busqueda dedicada a kawaii stationery supplies."
    }
  ],
  methods: {
    "porter": {
      file: "metodo-porter.html",
      emoji: "🏛️",
      number: "01",
      title: "Cinco Fuerzas de Porter",
      shortTitle: "Porter",
      subtitle: "Entregable: mapa de presion competitiva para papeleria kawaii en Bogota y Colombia.",
      question: "Que tan defendible es entrar con una marca kawaii frente a tiendas locales, marketplaces, cadenas tradicionales y compras internacionales?",
      scope: [
        { title: "Bogota", emoji: "📍", text: "Competidores directos como tiendas kawaii locales, papelerias de nicho, emprendimientos de Instagram y ferias universitarias." },
        { title: "Colombia", emoji: "🇨🇴", text: "Marketplaces, marcas online con envio nacional, cadenas de papeleria y vendedores multimarca con logistica amplia." },
        { title: "Global", emoji: "🌐", text: "Sustitutos internacionales como SHEIN, Temu y compras directas que presionan precio y variedad." }
      ],
      findings: [
        { title: "Rivalidad alta", text: "Mercado Libre y Falabella agregan muchos vendedores y precios comparables. Las tiendas locales compiten por estetica, surtido y cercania." },
        { title: "Sustitutos fuertes", text: "SHEIN y Temu reducen el precio de referencia para stickers y accesorios pequenos; la defensa debe ser rapidez, curaduria y experiencia." },
        { title: "Proveedores con poder medio", text: "En China hay variedad, pero el riesgo de calidad, MOQ, tiempos e intermediarios vuelve clave tener proveedor principal y backup." }
      ],
      table: {
        headers: ["Fuerza", "Bogota", "Colombia", "Intensidad", "Implicacion"],
        rows: [
          ["Rivalidad entre competidores", "Tiendas kawaii, papelerias, bazares, emprendimientos", "Mercado Libre, Falabella, Panamericana, tiendas online", "Alta", "Diferenciar por marca, combos y experiencia; no entrar solo por precio."],
          ["Amenaza de nuevos entrantes", "Alta por baja inversion inicial y venta por redes", "Alta por marketplaces y dropshipping", "Alta", "Construir comunidad y activos de marca desde el dia 1."],
          ["Amenaza de sustitutos", "Papeleria comun, regalos, accesorios de belleza, productos virales", "SHEIN, Temu, AliExpress y sellers internacionales", "Muy alta", "Vender conveniencia local, entrega rapida y seleccion curada."],
          ["Poder de proveedores", "Bajo en compra local, medio en importacion", "Medio por dependencia de Asia y logistica", "Media", "Validar muestras, contratos, inspeccion y proveedor alterno."],
          ["Poder de clientes", "Alto: comparan precios y reaccionan a tendencias", "Alto: marketplaces muestran precio y envio", "Alta", "Crear kits dificiles de comparar unidad por unidad."]
        ]
      },
      actions: [
        "Entrar con 20 a 40 SKUs curados, no con surtido masivo.",
        "Crear bundles propios para reducir comparacion directa con Temu o Mercado Libre.",
        "Medir precio, envio, empaque y respuesta de 8 a 12 competidores durante 4 semanas.",
        "Definir una promesa competitiva: rapido en Bogota, bonito para regalar y listo para contenido."
      ]
    },
    "pestel": {
      file: "metodo-pestel.html",
      emoji: "🌎",
      number: "02",
      title: "PESTEL",
      shortTitle: "PESTEL",
      subtitle: "Entregable: matriz de riesgos externos y oportunidades macro para importar y vender kawaii.",
      question: "Que factores politicos, economicos, sociales, tecnologicos, ambientales y legales pueden afectar el negocio?",
      scope: [
        { title: "Bogota", emoji: "🏙️", text: "Alta concentracion de estudiantes, universidades, oficinas, coworkings y compradores por redes." },
        { title: "Colombia", emoji: "📦", text: "Ecommerce y marketplaces permiten vender nacionalmente, pero costos logisticos varian por ciudad." },
        { title: "Importacion", emoji: "🚢", text: "Dolar, fletes, DIAN, IVA, tiempos de China y control documental afectan margen real." }
      ],
      findings: [
        { title: "Social", text: "La cultura study, journaling, TikTok e influencia coreana/japonesa sostienen la demanda visual." },
        { title: "Economico", text: "La sensibilidad al precio es alta; el margen depende de calcular costo aterrizado, pauta, devoluciones y empaque." },
        { title: "Tecnologico", text: "La ventaja competitiva pasa por contenido corto, WhatsApp Business, marketplaces y automatizacion de catalogo." }
      ],
      table: {
        headers: ["Dimension", "Senal Bogota/Colombia", "Oportunidad", "Riesgo", "Accion"],
        rows: [
          ["Politico", "Reglas DIAN, nacionalizacion e impuestos", "Formalizar importacion y ganar confianza", "Retenciones, demoras, errores documentales", "Usar asesor aduanero en importacion piloto."],
          ["Economico", "Dolar, fletes, pauta y poder adquisitivo", "Productos pequenos con ticket accesible", "Margen erosionado por costos ocultos", "Modelo de precio con costo aterrizado y margen minimo."],
          ["Social", "Journaling, regalos, cultura cute, K-pop y estudio aesthetic", "Contenido viral y recompra emocional", "Tendencias cambian rapido", "Reordenar ganadores y evitar inventario lento."],
          ["Tecnologico", "Compra por Instagram, WhatsApp, Mercado Libre y Falabella", "Escalar sin local fisico", "Dependencia de algoritmos", "Diversificar canales y capturar datos de clientes."],
          ["Ambiental", "Empaques y percepcion de exceso plastico", "Diferenciar con empaque reusable o reciclable", "Critica por importacion de bajo valor", "Usar packaging liviano y comunicar cuidado."],
          ["Legal", "Propiedad intelectual, licencias, etiquetado y garantias", "Construir marca propia sin depender de personajes", "Riesgo por copias de Sanrio/anime sin licencia", "Separar productos genericos de productos licenciados."]
        ]
      },
      actions: [
        "Hacer una matriz PESTEL trimestral antes de cada compra grande.",
        "Separar productos con personajes licenciados de disenos genericos seguros.",
        "Incluir variacion del dolar y flete en el simulador de precios.",
        "Usar pruebas de contenido para validar tendencia antes de importar volumen."
      ]
    },
    "bcg": {
      file: "metodo-bcg.html",
      emoji: "⭐",
      number: "03",
      title: "Matriz BCG",
      shortTitle: "BCG",
      subtitle: "Entregable: portafolio de SKUs por prioridad competitiva y rotacion esperada.",
      question: "Que productos deben recibir inversion, cuales sostienen caja y cuales deben probarse con cuidado?",
      scope: [
        { title: "Alta rotacion", emoji: "🚀", text: "Stickers, resaltadores, lapiceros y washi tape son comparables, baratos y faciles de vender en combos." },
        { title: "Ticket medio", emoji: "📚", text: "Agendas, planners, cartucheras y organizadores suben el valor del pedido, pero requieren curaduria visual." },
        { title: "Expansion", emoji: "🧸", text: "Lifestyle, mugs, setup, tecnologia cute y decoracion amplian mercado, pero distraen si entran demasiado pronto." }
      ],
      findings: [
        { title: "Estrellas", text: "Los productos de bajo ticket y alta visibilidad para video son los mejores para crecer rapido." },
        { title: "Vacas de caja", text: "Combos escolares, agendas y kits de regalo pueden sostener margen si se empaquetan como coleccion." },
        { title: "Interrogantes", text: "Productos de setup o lifestyle pueden ser atractivos, pero deben probarse con microinventario." }
      ],
      table: {
        headers: ["Cuadrante", "Productos", "Evidencia competitiva", "Decision"],
        rows: [
          ["Estrella", "Stickers, resaltadores pastel, lapiceros gel, mini notas", "Alta presencia en Mercado Libre, Falabella y SHEIN; faciles de mostrar en video", "Comprar variedad moderada y armar combos."],
          ["Vaca de caja", "Agendas, planners, cartucheras, kits universitarios", "Ticket mas alto y valor de regalo; Gaman y marketplaces muestran agendas kawaii", "Usar para subir ticket promedio y temporadas."],
          ["Interrogante", "Mini lamparas, deskpads, teclados cute, termos, mugs", "Atractivos para lifestyle, pero fuera del nucleo papeleria", "Probar 3 a 5 SKUs con preventa o baja cantidad."],
          ["Perro", "Referencias muy genericas, copias saturadas, productos pesados", "Comparacion fuerte por precio y envio", "Evitar salvo que tengan margen claro o funcionen en bundle."]
        ]
      },
      actions: [
        "Etiquetar cada SKU como estrella, caja, prueba o salida.",
        "Reinvertir primero en estrellas y vacas de caja.",
        "Liquidar productos lentos en combos tematicos.",
        "No ampliar a lifestyle hasta tener repeticion de compra en papeleria."
      ]
    },
    "ansoff": {
      file: "metodo-ansoff.html",
      emoji: "🧭",
      number: "04",
      title: "Matriz Ansoff",
      shortTitle: "Ansoff",
      subtitle: "Entregable: mapa de crecimiento por mercado y producto.",
      question: "Como crecer sin perder foco ni bloquear caja en inventario incorrecto?",
      scope: [
        { title: "Mercado actual", emoji: "🎒", text: "Estudiantes, journaling, regalos y oficinas creativas en Bogota." },
        { title: "Mercado nacional", emoji: "🛫", text: "Envios a ciudades principales mediante marketplace, transportadora y redes." },
        { title: "Producto futuro", emoji: "✨", text: "Marca propia, colecciones limitadas, suscripciones y accesorios de setup." }
      ],
      findings: [
        { title: "Penetracion primero", text: "Antes de diversificar, conviene ganar repeticion en Bogota con kits muy claros." },
        { title: "Desarrollo de mercado", text: "Colombia se puede abordar desde marketplaces y contenido, sin abrir locales fisicos." },
        { title: "Diversificacion controlada", text: "Lifestyle cute debe entrar como prueba, no como compra principal." }
      ],
      table: {
        headers: ["Ruta", "Aplicacion Bogota", "Aplicacion Colombia", "Riesgo/condicion"],
        rows: [
          ["Penetracion de mercado", "Promos por universidades, pop-ups y entregas rapidas", "Campanas de redes y Mercado Libre", "Necesita contenido constante y recompra."],
          ["Desarrollo de mercado", "Pasar de Chapinero/Usaquen/Suba a toda la ciudad", "Medellin, Cali, Barranquilla, Bucaramanga", "Requiere politica clara de envios y devoluciones."],
          ["Desarrollo de producto", "Combos study, kits de regalo, colecciones por personaje generico", "Colecciones por temporada y cajas sorpresa", "Validar con preventa y encuestas."],
          ["Diversificacion", "Setup, decoracion, mugs, tecnologia cute", "Lifestyle kawaii nacional", "Solo despues de identificar ganadores y caja estable."]
        ]
      },
      actions: [
        "Primeros 90 dias: penetracion en Bogota con papeleria nucleo.",
        "Dias 90 a 180: mercado nacional con productos ganadores.",
        "Despues: desarrollo de colecciones y marca propia.",
        "Diversificar solo con presupuesto de prueba separado."
      ]
    },
    "oceano-azul": {
      file: "metodo-oceano-azul.html",
      emoji: "🌊",
      number: "05",
      title: "Oceano Azul",
      shortTitle: "Oceano Azul",
      subtitle: "Entregable: curva de valor para diferenciarse de precio bajo y surtido generico.",
      question: "Que debe eliminar, reducir, elevar y crear la marca para no competir como otro importador barato?",
      scope: [
        { title: "Competencia roja", emoji: "🔴", text: "Marketplaces e importadores pelean por precio, cantidad y envio." },
        { title: "Espacio azul", emoji: "🔵", text: "La oportunidad esta en curaduria, empaque, narrativa, comunidad y experiencia de unboxing." },
        { title: "Marca propuesta", emoji: "💫", text: "Una papeleria kawaii con colecciones claras y contenido util para study, journaling y regalo." }
      ],
      findings: [
        { title: "Eliminar", text: "Catalogo infinito sin criterio, dependencia de personajes copiados y venta de unidades sueltas sin historia." },
        { title: "Reducir", text: "Comparacion directa por precio, exceso de SKUs, empaques genericos y productos pesados." },
        { title: "Crear", text: "Kits por ocasion, guia de uso, comunidad, pop-ups y experiencia de regalo." }
      ],
      table: {
        headers: ["Variable", "Marketplaces", "Tiendas kawaii locales", "Marca propuesta", "Decision"],
        rows: [
          ["Precio bajo", "Muy fuerte", "Medio", "Competitivo, no el mas barato", "No pelear contra Temu unidad por unidad."],
          ["Curaduria", "Baja a media", "Media", "Alta", "Seleccionar por colecciones y uso."],
          ["Experiencia de empaque", "Baja", "Media", "Muy alta", "Volver el unboxing parte del valor."],
          ["Rapidez Bogota", "Alta en algunos sellers", "Media", "Alta", "Promesa local clara."],
          ["Comunidad y contenido", "Baja", "Variable", "Muy alta", "TikTok, Reels, lives y UGC."],
          ["Kits listos para regalar", "Media", "Media", "Alta", "Vender solucion, no solo producto."]
        ]
      },
      actions: [
        "Crear 5 kits con nombres propios y foto fuerte.",
        "Disenar empaque base antes de comprar volumen.",
        "Publicar comparativos de escritorio antes/despues y armado de pedidos.",
        "Medir recompra por coleccion, no solo por SKU."
      ]
    },
    "jtbd": {
      file: "metodo-jtbd.html",
      emoji: "🎯",
      number: "06",
      title: "Jobs To Be Done",
      shortTitle: "JTBD",
      subtitle: "Entregable: mapa de trabajos del cliente y brechas frente a competidores.",
      question: "Para que contrata realmente el cliente una papeleria kawaii?",
      scope: [
        { title: "Trabajo funcional", emoji: "📝", text: "Organizar clases, estudiar, tomar apuntes, planear tareas y marcar objetos." },
        { title: "Trabajo emocional", emoji: "💗", text: "Sentir ternura, motivacion, orden, identidad estetica y alegria de comprar." },
        { title: "Trabajo social", emoji: "📸", text: "Crear contenido, regalar bonito, mostrar escritorio y pertenecer a una comunidad visual." }
      ],
      findings: [
        { title: "No compra solo utilidad", text: "El cliente no busca un lapicero cualquiera; busca una sensacion y una identidad visual." },
        { title: "La entrega rapida resuelve ansiedad", text: "Frente a Temu o SHEIN, una marca local puede ganar por inmediatez y confianza." },
        { title: "El bundle reduce friccion", text: "Los kits listos ayudan a quien no sabe combinar productos." }
      ],
      table: {
        headers: ["Trabajo", "Situacion", "Competidor que lo cubre", "Brecha"],
        rows: [
          ["Estudiar bonito", "Inicio de semestre, examenes, apuntes", "Panamericana, Mercado Libre, tiendas locales", "Kits study aesthetic curados por carrera/uso."],
          ["Regalar rapido", "Cumpleanos, amigo secreto, detalle sorpresa", "Marketplaces, tiendas de regalos", "Caja kawaii lista con nota y empaque."],
          ["Hacer journaling", "Rutina creativa semanal", "SHEIN, Kunikolor, Raya & Papel", "Combos por tema y tutoriales de uso."],
          ["Decorar escritorio", "Home office, universidad, setup", "Falabella, tiendas de decoracion", "Linea pequena de organizadores y accesorios cute."],
          ["Crear contenido", "TikTok, Reels, unboxing", "Tiendas visuales e internacionales", "Productos fotogenicos y empaques compartibles."]
        ]
      },
      actions: [
        "Crear fichas de cliente por trabajo, no por edad solamente.",
        "Probar mensajes: estudio, regalo, journaling, setup y contenido.",
        "Disenar combos que resuelvan cada trabajo en una compra.",
        "Medir que trabajo genera mayor conversion y recompra."
      ]
    },
    "journey": {
      file: "metodo-customer-journey.html",
      emoji: "🛤️",
      number: "07",
      title: "Customer Journey Map",
      shortTitle: "Customer Journey",
      subtitle: "Entregable: mapa de experiencia desde descubrimiento hasta recompra.",
      question: "Donde pierde o gana valor la experiencia frente a competidores locales y marketplaces?",
      scope: [
        { title: "Descubrimiento", emoji: "📱", text: "TikTok, Instagram, busquedas en Mercado Libre/Falabella y recomendaciones." },
        { title: "Compra", emoji: "🛒", text: "WhatsApp, tienda online, marketplace, pagos digitales y confirmacion de envio." },
        { title: "Postventa", emoji: "🎁", text: "Entrega, unboxing, calidad percibida, seguimiento, reseñas y recompra." }
      ],
      findings: [
        { title: "Contenido abre la puerta", text: "El nicho responde a videos satisfactorios, armado de pedidos y escritorio aesthetic." },
        { title: "WhatsApp sigue siendo critico", text: "En Colombia la confianza se refuerza con respuesta rapida y humana." },
        { title: "Unboxing puede ser ventaja", text: "Marketplaces son eficientes, pero rara vez memorables." }
      ],
      table: {
        headers: ["Fase", "Conducta del cliente", "Competidor visible", "Dolor", "Oportunidad"],
        rows: [
          ["Descubre", "Ve reels, TikToks o resultados de busqueda", "Tiendas locales, SHEIN, Mercado Libre", "Demasiadas opciones", "Curaduria y videos por uso."],
          ["Compara", "Mira precio, envio, fotos, reseñas", "Mercado Libre, Falabella, Panamericana", "Duda de calidad o tamano real", "Fotos propias y pruebas de producto."],
          ["Pregunta", "Escribe por WhatsApp o comentarios", "Tiendas Instagram", "Respuestas lentas", "Plantillas y catalogo ordenado."],
          ["Compra", "Paga por link, transferencia o marketplace", "Marketplaces", "Friccion de pago o envio", "Pago simple y promesa de despacho."],
          ["Recibe", "Evalua empaque, calidad y sorpresa", "Todos", "Producto distinto a foto", "Control visual y regalo pequeno."],
          ["Recompra", "Vuelve por coleccion o temporada", "Tiendas con comunidad", "Olvida la marca", "Calendario de drops y lista VIP."]
        ]
      },
      actions: [
        "Mapear 3 compras reales: Mercado Libre, tienda local e internacional.",
        "Medir tiempo de respuesta, claridad de fotos, costo total y entrega.",
        "Crear protocolo de empaque y seguimiento.",
        "Pedir reseña con foto y usarla como prueba social."
      ]
    },
    "value-proposition": {
      file: "metodo-value-proposition.html",
      emoji: "🧩",
      number: "08",
      title: "Value Proposition Canvas",
      shortTitle: "Value Proposition",
      subtitle: "Entregable: propuesta de valor validable frente a dolores y ganancias del cliente.",
      question: "Que oferta puede ser mas atractiva que comprar barato, generico o esperar envio internacional?",
      scope: [
        { title: "Cliente", emoji: "👩‍🎓", text: "Estudiantes, universitarias, journalers, creators, oficinas creativas y compradores de regalos." },
        { title: "Dolores", emoji: "⚠️", text: "Calidad incierta, demora, productos repetidos, falta de combinacion, compra fria y poca confianza." },
        { title: "Ganancias", emoji: "🌟", text: "Bonito, listo para regalar, rapido, coleccionable, compartible y facil de recomprar." }
      ],
      findings: [
        { title: "La propuesta debe ser concreta", text: "No basta decir kawaii; hay que prometer kits listos, calidad revisada y experiencia bonita." },
        { title: "Curaduria vence saturacion", text: "El cliente no quiere revisar 5.000 resultados si alguien confiable ya selecciono por el." },
        { title: "La marca reduce riesgo", text: "Fotos reales, empaque y control de calidad compensan el precio superior frente a importacion directa." }
      ],
      table: {
        headers: ["Bloque", "Dolores/Ganancias", "Propuesta", "Prueba"],
        rows: [
          ["Customer jobs", "Estudiar, regalar, decorar, crear contenido", "Kits por ocasion: study, regalo, journaling, setup", "Landing con preventa y encuesta."],
          ["Pains", "Demora, mala calidad, productos repetidos", "Control visual, fotos reales y despacho local", "Mystery shopper y reseñas con foto."],
          ["Gains", "Ternura, orden, identidad, sorpresa", "Empaque aesthetic, sticker regalo, colecciones", "Unboxing grabado y tasa de recompra."],
          ["Products", "Stickers, resaltadores, agendas, lapiceros, organizadores", "Linea nucleo de 20 a 40 SKUs", "Rotacion por categoria."],
          ["Pain relievers", "No saber combinar ni confiar", "Combos curados y asesor por WhatsApp", "Conversion de chats a compra."],
          ["Gain creators", "Coleccionismo y comunidad", "Drops limitados y lista VIP", "Ventas por drop y UGC."]
        ]
      },
      actions: [
        "Redactar una promesa de valor en una frase.",
        "Probar 3 bundles con audiencia antes de importar volumen.",
        "Comparar conversion de producto suelto vs kit.",
        "Usar reseñas y videos reales como evidencia de confianza."
      ]
    },
    "kraljic": {
      file: "metodo-kraljic.html",
      emoji: "🏭",
      number: "09",
      title: "Matriz Kraljic",
      shortTitle: "Kraljic",
      subtitle: "Entregable: estrategia de abastecimiento por riesgo e impacto economico.",
      question: "Que productos y proveedores merecen mas control antes de importar?",
      scope: [
        { title: "Bajo riesgo", emoji: "🟢", text: "Stickers genericos, notas adhesivas, clips y accesorios simples con muchos proveedores." },
        { title: "Riesgo medio", emoji: "🟡", text: "Agendas, planners, cartucheras, productos con acabados y empaques mas sensibles." },
        { title: "Riesgo alto", emoji: "🔴", text: "Productos con personajes, electronicos, lamparas, marca licenciada o proveedores no verificados." }
      ],
      findings: [
        { title: "No todo SKU exige el mismo control", text: "Un sticker generico y una agenda personalizada no tienen el mismo riesgo operativo." },
        { title: "Calidad visual es critica", text: "En kawaii, color, impresion, olor, empaque y acabado afectan valor percibido." },
        { title: "Backup obligatorio", text: "Para ganadores se necesita proveedor principal y alterno." }
      ],
      table: {
        headers: ["Familia de compra", "Riesgo suministro", "Impacto margen", "Cuadrante", "Estrategia"],
        rows: [
          ["Stickers y washi tape genericos", "Bajo", "Medio", "Rutinario", "Comprar en lotes pequenos y varios proveedores."],
          ["Resaltadores y lapiceros kawaii", "Medio", "Alto", "Apalancamiento", "Negociar volumen despues de validar rotacion."],
          ["Agendas y planners", "Medio", "Alto", "Estrategico", "Muestras, control de impresion y proveedor estable."],
          ["Productos con personajes licenciados", "Alto", "Alto", "Cuello de botella/estrategico", "Verificar licencias o evitar copias."],
          ["Mini lamparas y gadgets", "Alto", "Medio", "Cuello de botella", "Probar poco, revisar seguridad y devoluciones."],
          ["Empaque local", "Bajo", "Alto", "Apalancamiento", "Comprar local para diferenciar y responder rapido."]
        ]
      },
      actions: [
        "Clasificar proveedores antes de pedir cotizacion final.",
        "Pedir muestras fisicas de todo producto visualmente sensible.",
        "Separar compra piloto de compra de reposicion.",
        "Documentar fotos de muestra aprobada para comparar pedido masivo."
      ]
    },
    "kano": {
      file: "metodo-kano.html",
      emoji: "💎",
      number: "10",
      title: "Kano Model",
      shortTitle: "Kano",
      subtitle: "Entregable: matriz de atributos basicos, de desempeno y encantadores.",
      question: "Que atributos debe cumplir la marca y cuales pueden generar sorpresa, preferencia y recompra?",
      scope: [
        { title: "Basicos", emoji: "✅", text: "Producto igual a foto, calidad aceptable, pago seguro, entrega cumplida y respuesta clara." },
        { title: "Desempeno", emoji: "📈", text: "Mas variedad, mejor precio, despacho rapido, fotos reales y disponibilidad estable." },
        { title: "Encantadores", emoji: "🎀", text: "Empaque bonito, nota personalizada, sticker regalo, colecciones limitadas y experiencia de unboxing." }
      ],
      findings: [
        { title: "Los basicos no emocionan, pero fallar destruye confianza", text: "Si el producto llega distinto, roto o tarde, ningun empaque compensa." },
        { title: "El desempeno compite con marketplaces", text: "Precio, variedad y rapidez deben estar en rango competitivo." },
        { title: "Los encantadores diferencian", text: "La experiencia kawaii puede justificar margen si se siente cuidada y compartible." }
      ],
      table: {
        headers: ["Atributo", "Tipo Kano", "Competidor referencia", "Accion"],
        rows: [
          ["Producto coincide con foto", "Basico", "Marketplaces y tiendas serias", "Fotos propias y control de calidad."],
          ["Entrega rapida en Bogota", "Desempeno", "Mercado Libre, Falabella, tiendas locales", "Despacho 24/48h para inventario disponible."],
          ["Precio competitivo", "Desempeno", "SHEIN, Temu, Mercado Libre", "No ser el mas barato; justificar valor por kit."],
          ["Empaque aesthetic", "Encantador", "Tiendas boutique", "Bolsas, papel seda, tarjeta y sticker."],
          ["Sorpresa gratis", "Encantador", "Marcas con comunidad", "Sticker o mini nota segun ticket."],
          ["Colecciones limitadas", "Encantador", "Kunikolor/Raya & Papel y fandoms visuales", "Drops tematicos medidos por lista de espera."],
          ["Atencion por WhatsApp", "Desempeno", "Tiendas locales", "Respuesta rapida y asesoramiento de combos."]
        ]
      },
      actions: [
        "Encuestar 30 clientes con atributos basicos, desempeno y sorpresa.",
        "Crear checklist de calidad antes de empacar.",
        "Medir NPS o satisfaccion despues de entrega.",
        "Probar dos encantadores: nota personalizada y regalo pequeno."
      ]
    }
  }
};

var _ = require('lodash');

// This is really messy, and I apologize for that.

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var coreSchemaTypes = [
  'array',
  'boolean',
  'integer',
  'number',
  'null',
  'object',
  'string'
]


function generatePropertyRestrictions(schema) {
  var generate = generateSinglePropertyRestriction(schema)
  return [
    generate('minimum', 'Minimum'),
    generate('maximum', 'Maximum'),
    generate('pattern', 'Regex pattern'),
    generate('minItems', 'Minimum items'),
    generate('uniqueItems', 'Unique items')
  ].filter(function(text) {
    return text
  }).join('<br>')
}

function generateSinglePropertyRestriction(schema) {
  return function(key, text) {
    if (schema[key]) {
      return ' - ' + text + ': `' + schema[key] + '`'
    } else {
      return null
    }
  }
}

function generateSchemaSectionText(prefix, name, isRequired, schema, subSchemas, childOfTable) {
  var schemaType = getActualType(schema, subSchemas)

  var isNullable = false;
  if ((schemaType instanceof Array) && schemaType.indexOf('null') != -1) {
    isNullable = true;
    schemaType = schemaType.filter(function(type){
      return type !== 'null';
    });
    if (schemaType.length = 1) {
      schemaType = schemaType[0]
    }
  }

  var description = schema.description || ''
  if (schema.example) {
    description += '<br> **Example:** `' + schema.example + '`'
  }


  if (schemaType === 'enum') {
    description += '<br>The object is an enum, with one of the following required values:<br>'
    description += schema.enum.map(function(enumItem) {
      return ' - `' + enumItem + '`'
    }).join('<br>')
  }


  var restrictions = generatePropertyRestrictions(schema)
  if (restrictions) {
    description += '<br>**Additional restrictions:**<br>'
    description += restrictions
  }

  var arrayIndentPrefix = '&nbsp;&nbsp;&nbsp;&nbsp;'

  var text = []
  var outSchemaType = null
  var fullname = prefix ? prefix + (prefix.endsWith(arrayIndentPrefix) ? '' : '.') + name : name

  if (schemaType === 'array') {
    var itemsType = schema.items && schema.items.type
    if (!itemsType && schema.items['$ref']) {
      itemsType = getActualType(schema.items, subSchemas)
    }
    outSchemaType = 'array of `' + itemsType + '`'
  } else if (schema.oneOf) {
    outSchemaType = 'one of:<br>'
    outSchemaType += schema.oneOf.map(function(oneOf) {
      if (oneOf.type) {
        if (oneOf.type === 'array') {
          var itemsType = oneOf.items && oneOf.items.type
          if (!itemsType && oneOf.items['$ref']) {
            itemsType = getActualType(oneOf.items, subSchemas)
          }
          return ' - array of `' + itemsType + '`';
        }
        if (oneOf.type === 'null') {
          isNullable = true; 
          return '';
        }
        return ' - `' + oneOf.type + '`';
      }
      return ' - `' + subSchemas[oneOf['$ref']] + '`';
    }).join('<br>')
  }

  var row = ['', fullname]
  row.push(outSchemaType || schemaType || '*unknown*')
  // row.push(isRequired ? '**required**' : '*optional*')
  row.push(isNullable ? '✓' : '')
  row.push(description)
  row.push('')
  text.push(row.join('|'));




  if (schemaType.properties) {
    generatePropertySection(fullname, schema, subSchemas, childOfTable).forEach(function(section) {
      text = text.concat(section)
    })
  } else if (schemaType === 'array') {
    var itemsType = schema.items && schema.items.type
    if (!itemsType && schema.items['$ref']) {
      itemsType = getActualType(schema.items, subSchemas)
    }
    if (itemsType.properties) {
      generatePropertySection((prefix ? prefix : '') + arrayIndentPrefix , schema.items, subSchemas, childOfTable).forEach(function(section) {
        text = text.concat(section)
      })
    }
  }


  return text
}

function generatePropertySection(prefix, schema, subSchemas, childOfTable) {
  if (schema.properties) {
    var properties = Object.keys(schema.properties).map(function(propertyKey) {
      var propertyIsRequired = schema.required && schema.required.indexOf(propertyKey) >= 0
      if (schema.noDocs && schema.noDocs.indexOf(propertyKey) != -1) {
        return null;
      }
      return generateSchemaSectionText(prefix, propertyKey, propertyIsRequired, schema.properties[propertyKey], subSchemas, childOfTable)
    })

    if (prefix) {
      return properties
    } else {
      var rows = []
      if (!childOfTable) {
        rows.push('|Property|Type|Nullable|Description|')
        rows.push('|--------|----|--------|-----------|')
      }
      properties.forEach(function(section) {
        if (section) {
          rows = rows.concat(section)
        }
      });
      return [rows.join('\n')]
    }

  } else if (schema.oneOf) {
    var oneOfList = schema.oneOf.map(function(innerSchema) {

      return '* `' + getActualType(innerSchema, subSchemas) + '`'
    }).join('\n')
    return ['This property must be one of the following types:', oneOfList]
  } else {
    return []
  }
}

function getActualType(schema, subSchemas) {
  if (schema.type) {
    return schema.type
  } else if (schema['$ref'] && subSchemas[schema['$ref']]) {
    return subSchemas[schema['$ref']]
  } else if (schema.enum) {
    return 'enum'
  } else {
    return undefined
  }
}

module.exports = function(schema, childOfTable) {
  var subSchemaTypes = Object.keys(schema.definitions || {}).reduce(function(map, subSchemaTypeName) {
    map['#/definitions/' + subSchemaTypeName] = subSchemaTypeName
    return map
  }, {})

  var text = []

  if (schema.description) {
    text.push(schema.description)
  }

  if (schema.properties) {
    generatePropertySection(null, schema, subSchemaTypes, childOfTable).forEach(function(section) {
      text = text.concat(section)
    })

  } else if (schema.type === 'array') {
    text.push('###### Array of');
    text.push(module.exports(schema.items));
  }

  if (schema.definitions && schema.noDocs) {
    Object.keys(schema.definitions).forEach(function(subSchemaTypeName) {
      if (schema.noDocs.indexOf(subSchemaTypeName) != -1) {
        schema.definitions = _.omit(schema.definitions, subSchemaTypeName)
      }
    })
  }

  if (schema.definitions && Object.keys(schema.definitions).length > 0) {
    text.push('---')
    text.push('# Sub Schemas')
    Object.keys(schema.definitions).forEach(function(subSchemaTypeName) {
      text.push('## `' + subSchemaTypeName + '` (' + schema.definitions[subSchemaTypeName].type + ')')
      text.push(schema.definitions[subSchemaTypeName].description)
      generatePropertySection(null, schema.definitions[subSchemaTypeName], subSchemaTypes, childOfTable).forEach(function(section) {
        text = text.concat(section)
      })
    })
  }

  if (schema.allOf) {
    text.push(
      schema.allOf
        .map((s, i) => module.exports(s, i !== 0))
        .join('\n')
    );
  }
  return text.filter(function(line) {
    return !!line
  }).join('\n\n')
}


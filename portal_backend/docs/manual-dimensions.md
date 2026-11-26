# Dimensions zenye options maalumu

Dimension inaweza kuandaliwa pamoja na options zake kwenye dataset bila kuunda reference type. Data type `reference` inamaanisha uchaguzi kutoka orodha; bila `referenceTypeId`, orodha hutoka `dimension_options`. Orodha za pamoja kama mikoa zinaendelea kutumia `referenceTypeId`.

## Kuunda dimension

`POST /api/v1/datasets/3/dimensions`

```json
{
  "indicatorIds": [2],
  "dimension": {
    "dimensionCode": "TANTRADE_EVENT_DIRECTION",
    "nameEn": "Event Direction",
    "nameSw": "Mwelekeo wa Tukio",
    "dataType": "reference",
    "options": [
      {"code": "INCOMING", "nameEn": "Incoming", "nameSw": "Yanayoingia"},
      {"code": "OUTGOING", "nameEn": "Outgoing", "nameSw": "Yanayotoka"}
    ]
  },
  "isRequired": true,
  "displayOrder": 1
}
```

IDs ni mifano. `indicatorIds` ni IDs za indicators zilizounganishwa na dataset hii, si IDs za links. Angalau moja inahitajika kwa manual options. Dimension code ni unique kwenye catalogue; option code ni unique ndani ya dimension. Codes za options hutumia herufi kubwa, namba, underscore au hyphen.

Dataset lazima iwe draft. Options na referenceTypeId haviwezi kuchanganywa. Creation, links na audit huhifadhiwa kwenye transaction moja. Options zina IDs zao zinazorejeshwa kwenye response.

## Kusoma na kutumia

- `GET /api/v1/datasets/3/dimensions` husoma dimensions zote za dataset.
- `GET /api/v1/datasets/3/dimensions?indicatorId=2` husoma dimensions zinazohusu indicator hiyo pamoja na dimensions za pamoja za dataset.
- `GET /api/v1/dimensions/{dimensionId}` husoma definition na options zake.
- `PATCH /api/v1/datasets/3/dimensions/{dimensionId}` hubadili isRequired/displayOrder.
- `DELETE /api/v1/datasets/3/dimensions/{dimensionId}` huondoa link wakati dataset ni draft; haifuti definition/options.

Kuunganisha definition iliyopo hutumia `dimensionId` pamoja na `indicatorIds`. Indicators zilizochaguliwa kwenye link hazibadilishwi kwa PATCH; ondoa link kisha iunganishe upya wakati wa draft. Indicator yenye dimension haiwezi kutolewa kwenye dataset kabla ya kuondoa dimension link.

Options hazihaririwi kwenye PATCH ya definition. Kuunda definition mpya na kuunganisha upya kwenye draft ni njia ya kubadili orodha kwa sasa. Hii huzuia kubadilisha maana ya ID iliyotumika kwenye data za zamani.

## Template na targets

Activation huhifadhi schemaVersion 2, indicatorIds, optionSource na options zenye IDs ndani ya template snapshot. Matoleo ya zamani hayabadilishwi. Kwa manual dimensions, `dimensionValues[].value` ni ID ya dimension option, si reference value ID wala jina lake.

Targets huhakiki option dhidi ya snapshot, na required dimension hutumika kwa indicator husika tu. Dimensions za zamani zisizo na indicatorIds zinaendelea kuwa za dataset nzima. Submissions zijazo zifuate template version badala ya kusoma catalogue inayoweza kubadilika.

Hakuna mabadiliko ya frontend au utekelezaji mpya wa actual submissions katika mabadiliko haya.

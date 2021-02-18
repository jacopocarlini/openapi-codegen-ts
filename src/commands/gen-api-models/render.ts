/**
 * This module collects pure utility functions that render a code text based of a data structure.
 * Each function return a string containing formatted code, but does not write the code file.
 * Code generation might use template string literals or nunjucks templates.
 * Data structure might be a parsed structure or directly a OpenAPI object (in which case, the parsing logic is demanded to the template macros).
 */

import { ITuple3, Tuple2 } from "@pagopa/ts-commons/lib/tuples";
import { OpenAPIV2 } from "openapi-types";
import * as prettier from "prettier";
import {
  capitalize,
  toUnionOfLiterals,
  uncapitalize,
  withGenerics
} from "../../lib/utils";
import templateEnvironment from "./templateEnvironment";
import { IOperationInfo, ISpecMetaInfo } from "./types";

const { render } = templateEnvironment;

/**
 * Render a code block which exports an object literal representing the api specification
 *
 * @param spec the original api specification
 */
export function renderSpecCode(spec: OpenAPIV2.Document) {
  return formatCode(`
  /* tslint:disable:object-literal-sort-keys */
  /* tslint:disable:no-duplicate-string */
added this line
  // DO NOT EDIT

  export const specs = ${JSON.stringify(spec)};
`);
}

/**
 * Given a OpenAPI definition object, it renders the code which describes the correspondent typescript model
 * @param definitionName the name of the definition
 * @param definition the definition data
 * @param strictInterfaces wheater requires strict interfaces or not
 * @param camelCasedPropNames wheater model properties must me camel-cased.
 *
 * @returns the formatted code for the model's typescript definition
 */
export async function renderDefinitionCode(
  definitionName: string,
  definition: OpenAPIV2.DefinitionsObject,
  strictInterfaces: boolean,
  camelCasedPropNames: boolean = false
): Promise<string> {
  return render("model.ts.njk", {
    camelCasedPropNames,
    definition,
    definitionName,
    strictInterfaces
  }).then(formatCode);
}

/**
 * Given a list of parsed operations, it renders the code for an opinionated http client module that imlements each operation as an async method
 * @param specMeta meta info of the api specification
 * @param operations the list of parsed operations
 *
 * @returns the code of a http client
 */
export async function renderClientCode(
  specMeta: ISpecMetaInfo,
  operations: Array<IOperationInfo | undefined>,
  exactQueryParamNames: boolean = false
) {
  return render("client.ts.njk", {
    exactQueryParamNames,
    operations,
    spec: specMeta
  }).then(formatCode);
}

/**
 * Renders the code that includes every operation definition
 * @param allOperationInfos collection of parsed operations
 * @param generateResponseDecoders true to include decoders
 *
 * @return the rendered code
 */
export function renderAllOperations(
  allOperationInfos: Array<IOperationInfo | undefined>,
  generateResponseDecoders: boolean
) {
  const operationsTypes = allOperationInfos
    .filter(
      (operationInfo): operationInfo is IOperationInfo =>
        typeof operationInfo !== "undefined"
    )
    .map(operationInfo =>
      // the code of an operation associated with its needed imported types
      Tuple2(
        renderOperation(operationInfo, generateResponseDecoders),
        operationInfo.importedTypes
      )
    );

  // the set of referenced definitions
  const operationsImports = new Set<string>(
    operationsTypes.reduce((p, { e2 }) => [...p, ...e2], [] as string[])
  );

  // the concatenated generated code
  const operationTypesCode = operationsTypes.map(({ e1 }) => e1).join("\n");

  return formatCode(`
        // DO NOT EDIT THIS FILE
        // This file has been generated by gen-api-models
        // tslint:disable:max-union-size
        // tslint:disable:no-identical-functions
  
        ${generateResponseDecoders ? 'import * as t from "io-ts";' : ""}
  
        import * as r from "@pagopa/ts-commons/lib/requests";
  
        ${Array.from(operationsImports.values())
          .map(i => `import { ${i} } from "./${i}";`)
          .join("\n\n")}
  
        ${operationTypesCode}
      `);
}

/**
 * Render the code of decoders and request types of a single operation
 * @param operationInfo
 * @param generateResponseDecoders true if decoders have to be added
 *
 * @returns a tuple containing the generated code and the
 */
export const renderOperation = (
  operationInfo: IOperationInfo,
  generateResponseDecoders: boolean
): string => {
  const { method, operationId, headers, responses, parameters } = operationInfo;

  const requestType = `r.I${capitalize(method)}ApiRequestType`;

  const headersCode =
    headers.length > 0 ? headers.map(_ => `"${_}"`).join("|") : "never";

  const responsesType = responses
    .map(
      ({ e1: statusCode, e2: typeName, e3: headerNames }) =>
        `r.IResponseType<${statusCode}, ${typeName}, ${toUnionOfLiterals(
          headerNames
        )}>`
    )
    .join("|");

  // wraps an identifiler with doublequotes
  const escapeIdentifier = (id: string) =>
    id.includes("?") ? `"${id.replace("?", "")}"?` : `"${id}"`;

  const paramsCode = parameters
    .map(param => `readonly ${escapeIdentifier(param.name)}: ${param.type}`)
    .join(",");

  const responsesDecoderCode = generateResponseDecoders
    ? renderDecoderCode(operationInfo)
    : "";

  const requestTypeDefinition = `export type ${capitalize(
    operationId
  )}T = ${requestType}<{${paramsCode}}, ${headersCode}, never, ${responsesType}>;
  `;

  const code = `
    /****************************************************************
     * ${operationId}
     */

    // Request type definition
    ${requestTypeDefinition}${responsesDecoderCode}`;

  return code;
};

/**
 * Compose the code for response decoder of an operation
 * @param operationInfo the operation
 *
 * @returns {string} the composed code
 */
export function renderDecoderCode({ responses, operationId }: IOperationInfo) {
  // use the first 2xx type as "success type" that we allow to be overridden
  const firstSuccessType = responses.find(
    ({ e1 }) => e1.length === 3 && e1[0] === "2"
  );
  if (!firstSuccessType) {
    return "";
  }

  // the name of the var holding the set of decoders
  const typeVarName = "type";

  const decoderFunctionName = `${operationId}Decoder`;
  const defaultDecoderFunctionName = `${operationId}DefaultDecoder`;

  const decoderName = (statusCode: string) => `d${statusCode}`;
  const decoderDefinitions = responses
    .map(
      ({ e1: statusCode, e2: typeName, e3: headerNames }, i) => `
    const ${decoderName(statusCode)} = (${getDecoderForResponse(
        { e1: statusCode, e2: typeName, e3: headerNames },
        typeVarName
      )}) as r.ResponseDecoder<r.IResponseType<${statusCode}, A${i}, ${toUnionOfLiterals(
        headerNames
      )}>>;
  `
    )
    .join("");
  const composedDecoders = responses.reduce(
    (acc, { e1: statusCode }) =>
      acc === ""
        ? decoderName(statusCode)
        : `r.composeResponseDecoders(${acc}, ${decoderName(statusCode)})`,
    ""
  );

  // a string with a concatenated pair of type variables for each decoder/encoder
  // ex: A0, C0, A1, C1, ...
  const responsesTGenerics = responses.reduce(
    (p: string[], r, i) => [...p, `A${i}`, `C${i}`],
    [] as string[]
  );
  // a string with a concatenated pair of type variables for each decoder/encoder
  // with defaults as defined in the parsed responses
  // ex: A0=X, C0=X, A1=Y, C1=Y, ...
  const responsesTGenericsWithDefaultTypes = responses.reduce(
    (p: string[], r, i) => [...p, `A${i} = ${r.e2}`, `C${i} = ${r.e2}`],
    [] as string[]
  );

  // ex: MyOperationResponseT<A0, C0, A1, C1>
  const responsesTypeName = withGenerics(
    `${capitalize(operationId)}ResponsesT`,
    responsesTGenerics
  );

  // ex: MyOperationResponseT<A0=X, C0=X, A1=Y, C1=Y>
  const responsesTypeNameWithDefaultTypes = withGenerics(
    `${capitalize(operationId)}ResponsesT`,
    responsesTGenericsWithDefaultTypes
  );

  // ex: myOperationResponseT<A0=X, C0=X, A1=Y, C1=Y>
  const decoderDefinitionName = withGenerics(
    decoderFunctionName,
    responsesTGenericsWithDefaultTypes
  );

  const responsesTContent = responses.map(
    ({ e1: statusCode }, i) => `${statusCode}: t.Type<A${i}, C${i}>`
  );

  // Then we create the whole type definition
  //
  // 200: t.Type<A1, C1>
  // 202: t.UndefinedC
  const responsesT = `
    export type ${responsesTypeNameWithDefaultTypes} = {
      ${responsesTContent.join(", ")}
    };
  `;

  // This is the type of the first success type
  // We need it to keep retro-compatibility
  const responsesSuccessTContent = responses.reduce(
    (p: string, r, i) =>
      r.e1 !== firstSuccessType.e1 ? p : `t.Type<A${i}, C${i}>`,
    ""
  );

  const defaultResponsesVarName = `${uncapitalize(
    operationId
  )}DefaultResponses`;

  // Create an object with the default type for each response code:
  //
  // export const ${defaultResponsesVarName} = {
  //   200: MyType,
  //   202: t.undefined,
  //   400: t.undefined
  // };
  const defaultResponses = `
    export const ${defaultResponsesVarName} = {
      ${responses
        .map(r => `${r.e1}: ${r.e2 === "undefined" ? "t.undefined" : r.e2}`)
        .join(", ")}
    };
  `;

  // a type in the form
  //  r.ResponseDecoder<
  //    | r.IResponseType<200, A0, never>
  //    | r.IResponseType<202, A1, never>
  //  >;
  const returnType = `r.ResponseDecoder<
    ${responses
      .map(
        ({ e1: statusCode, e3: headerNames }, i) =>
          // tslint:disable-next-line: no-nested-template-literals
          `r.IResponseType<${statusCode}, A${i}, ${toUnionOfLiterals(
            headerNames
          )}>`
      )
      .join("|")}
  >`;

  return `
      ${defaultResponses}
      ${responsesT}
      export function ${decoderDefinitionName}(overrideTypes: Partial<${responsesTypeName}> | ${responsesSuccessTContent} | undefined = {}): ${returnType} {
        const isDecoder = (d: any): d is ${responsesSuccessTContent} =>
          typeof d["_A"] !== "undefined";

        const ${typeVarName} = {
          ...(${defaultResponsesVarName} as unknown as ${responsesTypeName}),
          ...(isDecoder(overrideTypes) ? { ${firstSuccessType.e1}: overrideTypes } : overrideTypes)
        };

        ${decoderDefinitions}
        return ${composedDecoders}
      }

      // Decodes the success response with the type defined in the specs
      export const ${defaultDecoderFunctionName} = () => ${decoderFunctionName}();`;
}

/**
 * Renders the response decoder associated to the given type.
 * Response types refer to io-ts-commons (https://github.com/pagopa/io-ts-commons/blob/master/src/requests.ts)
 * @param param0.status http status code the decoder is associated with
 * @param param0.type type to be decoded
 * @param param0.headers headers of the response
 * @param varName the name of the variables that holds the type decoder
 *
 * @returns a string which represents a decoder declaration
 */
function getDecoderForResponse(
  { e1: status, e2: type, e3: headers }: ITuple3<string, string, string[]>,
  varName: string
): string {
  return type === "Error"
    ? `r.basicErrorResponseDecoder<${status}>(${status})`
    : // checks at runtime if the provided decoder is t.undefined
      `${varName}[${status}].name === "undefined" 
        ? r.constantResponseDecoder<undefined, ${status}, ${toUnionOfLiterals(
        headers
      )}>(${status}, undefined) 
        : r.ioResponseDecoder<${status}, (typeof ${varName}[${status}])["_A"], (typeof ${varName}[${status}])["_O"], ${toUnionOfLiterals(
        headers
      )}>(${status}, ${varName}[${status}])`;
}

const formatCode = (code: string) =>
  prettier.format(code, {
    parser: "typescript"
  });

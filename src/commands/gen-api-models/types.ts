import { ITuple3 } from "@pagopa/ts-commons/lib/tuples";
import { OpenAPIV2, OpenAPIV3 } from "openapi-types";

/**
 * Defines the set of parameters for the code generation
 */
export interface IGenerateApiOptions {
  readonly specFilePath: string | OpenAPIV2.Document;
  readonly definitionsDirPath: string;
  readonly tsSpecFilePath?: string;
  readonly strictInterfaces?: boolean;
  readonly generateRequestTypes?: boolean;
  readonly generateResponseDecoders?: boolean;
  readonly generateClient?: boolean;
  readonly defaultSuccessType?: string;
  readonly defaultErrorType?: string;
  readonly camelCasedPropNames: boolean;
}

/**
 * Supported http methods
 */
export type SupportedMethod = "get" | "post" | "put" | "delete";

export type SupportedAuthScheme = "bearer" | "digest" | "none";

/**
 * Define the shape of a parsed parameter
 */
export interface IParameterInfo {
  readonly name: string;
  readonly type: string;
  readonly in: string;
  readonly headerName?: string;
}
/**
 * Define the shape of a parameter of type header
 */
export interface IHeaderParameterInfo extends IParameterInfo {
  readonly in: "header";
  readonly headerName: string;
}

/**
 * Define the shape of a parameter of type header which is also an auth parameter
 */
export interface IAuthHeaderParameterInfo extends IHeaderParameterInfo {
  readonly tokenType: "basic" | "apiKey" | "oauth2";
  readonly authScheme: SupportedAuthScheme;
}

/**
 * Define the shape of a parsed operation
 */
export interface IOperationInfo {
  readonly method: SupportedMethod;
  readonly operationId: string;
  readonly parameters: ReadonlyArray<IParameterInfo>;
  readonly responses: ReadonlyArray<
    ITuple3<string, string, ReadonlyArray<string>>
  >;
  readonly headers: ReadonlyArray<string>;
  readonly importedTypes: ReadonlySet<string>;
  readonly path: string;
  readonly consumes?: string;
  readonly produces?: string;
}

/**
 * Define the shape of an object containing the specification meta info
 */
export interface ISpecMetaInfo {
  readonly basePath?: string;
  readonly version?: string;
  readonly title?: string;
}

export type ExtendedOpenAPIV2SecuritySchemeApiKey = OpenAPIV2.SecuritySchemeApiKey & {
  readonly "x-auth-scheme": SupportedAuthScheme;
};

type ReferenceObject = OpenAPIV3.ReferenceObject;

/**
 * Define the shape of a schema definition as it supported by the generator,
 *   regardless of OpenAPI version.
 */
export interface IDefinition {
  readonly title?: string;
  readonly type?: string | ReadonlyArray<string>;
  readonly description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly default?: any;
  readonly format?: string;
  readonly items?: IDefinition;
  readonly maximum?: number;
  readonly exclusiveMaximum?: boolean;
  readonly minimum?: number;
  readonly exclusiveMinimum?: boolean;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly pattern?: string;
  readonly required?: ReadonlyArray<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly enum?: ReadonlyArray<any>;
  readonly properties?: {
    readonly [name: string]: ReferenceObject | IDefinition;
  };
  readonly additionalProperties?: boolean | ReferenceObject | IDefinition;
  readonly allOf?: ReadonlyArray<ReferenceObject | IDefinition>;
  readonly oneOf?: ReadonlyArray<ReferenceObject | IDefinition>;
  readonly ["x-import"]?: string;
}

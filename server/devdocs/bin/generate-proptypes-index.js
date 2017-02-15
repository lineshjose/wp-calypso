#!/usr/bin/env node

/**
 * This file generates an index of proptypes by component displayname, slug and folder name
 */

const startTime = process.hrtime();
require( 'babel-register' );

/**
 * External Dependencies
 */
const fs = require( 'fs' );
const path = require( 'path' );
const reactDocgen = require( 'react-docgen' );
const { flow } = require( 'lodash' );
const { filter, map } = require( 'lodash/fp' );
const { getPropertyName, getMemberValuePath, resolveToValue } = require( 'react-docgen/dist/utils' );

/**
 * Internal Dependencies
 */
const util = require( 'client/devdocs/docs-example/util' );

const root = path.dirname( path.join( __dirname, '..', '..' ) );
const pathSwap = new RegExp( path.sep, 'g' );
const handlers = [ ...reactDocgen.defaultHandlers, commentHandler ];

const main = () => {
	console.log( 'Generating component documentation' );
	const fileList = process
		.argv
		.splice( 2, process.argv.length )
		.map( ( fileWithPath ) => {
			return fileWithPath.replace( /^\.\//, '' );
		} );

	if ( fileList.length === 0 ) {
		throw new Error( 'You must pass a list of files to process' );
	}

	const documents = flow(
		map( processFile ),
		filterDocsWithExample,
		map( parseDocument ),
		filter( hasDisplayName )
	)( fileList );

	writeFile( documents );

	const elapsed = process.hrtime( startTime )[ 1 ] / 1000000;
	console.log( `Time: ${ process.hrtime( startTime )[ 0 ] }s ${ elapsed.toFixed( 3 ) }ms` );
};

/* File handling */

/**
 * Wraps fs.readFile in a Promise
 * @param {string} filePath The path to of the file to read
 * @return {string} The file contents
 */
function readFile( filePath ) {
	return fs.readFileSync( filePath, { encoding: 'utf8' } );
}

/**
 * Write the file
 * @param {Object} contents The contents of the file
 */
function writeFile( contents ) {
	fs.writeFileSync( path.join( root, 'server/devdocs/proptypes-index.json' ), JSON.stringify( contents ) );
}

/* Handlers for reactDocgen */

/**
 * Replaces **'s in comment blocks and trims comments
 * @param {string} str The doc string to clean
 * @return {string} The clean comment block text
 */
function parseDocblock( str ) {
	return str.split( '\n' ).map( ( line ) => {
		return line.replace( /^\s*\*\s?/, '' );
	} ).join( '\n' ).trim();
}

/**
 * Given a path, this function returns the closest preceding comment, if it exists
 * @param {NodePath} nodePath The node path from react-docgen
 * @return {null|string} The comment or nothing, if no comment
 */
function getComments( nodePath ) {
	let comments = [];

	if ( nodePath.node.leadingComments ) {
		// if there are comments before this property node, use the ones leading, not following a previous node
		comments = nodePath.node.leadingComments.filter(
			comment => comment.leading === true
		);
	} else if ( nodePath.node.comments ) {
		// if there are comments after this property node, use the ones following this node
		comments = nodePath.node.comments.filter(
			comment => comment.leading === false
		);
	}

	if ( comments.length > 0 ) {
		return parseDocblock( comments[ comments.length - 1 ].value );
	}

	return null;
}

/**
 * Handler for react-docgen to use in order to discover
 * @param {Documentation} documentation The object to mutate that will eventually be passed back to us from parse()
 * @param {NodePath} nodePath The node we are handling
 */
function commentHandler( documentation, nodePath ) {
	// retrieve the proptypes for this node, if they exist
	let propTypesPath = getMemberValuePath( nodePath, 'propTypes' );
	if ( ! propTypesPath ) {
		return;
	}

	// resolve a path to a value, if possible, will be ObjectExpression type if it can
	propTypesPath = resolveToValue( propTypesPath );
	if ( ! propTypesPath || propTypesPath.value.type !== 'ObjectExpression' ) {
		return;
	}

	// Iterate over all the properties in the proptypes object
	propTypesPath.get( 'properties' ).each( ( propertyPath ) => {
		// ensure that this node is a property
		if ( propertyPath.value.type !== 'Property' ) {
			return;
		}

		// get the prop name and description, ensuring that it either doesn't exist or is empty before continuing
		const propName = getPropertyName( propertyPath );
		const propDescriptor = documentation.getPropDescriptor( propName );

		if ( propDescriptor.description && propDescriptor.description !== '' ) {
			return;
		}

		// if we don't have anything, see if there are inline comments for this property
		propDescriptor.description = getComments( propertyPath ) || '';
	} );
}

/* Component processing */

/**
 * Calculates a filepath's include path and begins reading the file for parsing
 * Calls back with null, if an error occurs or an object if it succeeds
 * @param {string} filePath The path to read
 * @return {null|{ document: {object}, includePath: {string} }} The docObj, if it could be created, null if not
 */
function processFile( filePath ) {
	const filename = path.basename( filePath );
	const includePathRegEx = new RegExp( `^client${ path.sep }(.*?)${ path.sep }${ filename }$` );
	const includePathSuffix = (
		filename === 'index.jsx' ? '' : path.sep + path.basename( filename, '.jsx' )
	);
	const includePath = (
		includePathRegEx.exec( filePath )[ 1 ] + includePathSuffix
	).replace( pathSwap, '/' );
	try {
		const usePath = path.isAbsolute( filePath ) ? filePath : path.join( process.cwd(), filePath );
		const document = readFile( usePath );
		return {
			document,
			includePath
		};
	} catch ( error ) {
		console.log( `Skipping ${ filePath } due to fs error: ${ error }` );
	}
	return null;
}

/**
 * Filter out any components that don't have an example component, and keep the example components
 * @param {Array} docObjArray The array of docs to filter
 * @return {Array} The filtered array
 */
function filterDocsWithExample( docObjArray ) {
	const goodComponents = docObjArray
	// get all components that are example components
		.filter( ( obj ) => obj.includePath.endsWith( '/example' ) )
		// get their parent component folder '/author-selector/docs/example' to 'author-selector'
		.map( ( obj ) => obj.includePath.split( '/' ).splice( -3 )[ 0 ] );

	return docObjArray.filter( ( docObj ) => {
		const directory = path.basename( docObj.includePath );
		// this may lead to some false positives, but I think the speed is worth it ;)
		return goodComponents.includes( directory ) || docObj.includePath.endsWith( '/example' );
	} );
}

/**
 * Given a processed file object, parses the file for proptypes and calls the callback
 * Calls back with null on any error, or a parsed object if it succeeds
 * @param {Object} docObj The processed document object
 * @return {null | object} The parsed documentation object
 */
function parseDocument( docObj ) {
	try {
		const parsed = reactDocgen.parse( docObj.document, undefined, handlers );
		parsed.includePath = docObj.includePath;
		if ( parsed.displayName ) {
			parsed.slug = util.camelCaseToSlug( parsed.displayName );
		} else {
			// we have to figure it out -- use the directory name to get the slug
			parsed.slug = path.basename( docObj.includePath );
			parsed.displayName = util.slugToCamelCase( parsed.slug );
		}
		return parsed;
	} catch ( error ) {
		// skipping, probably because the file couldn't be parsed for many reasons (there are lots of them!)
		return null;
	}
}

/**
 * Determines whether or not a component has a displayName set
 * @param {object} component The component
 * @returns {boolean} True, if the component has a displayName set, else False
 */
function hasDisplayName( component ) {
	if ( ! component ) {
		return false;
	}

	const displayName = component.displayName;

	return ! (
		displayName === undefined || displayName === ''
	);
}

main();

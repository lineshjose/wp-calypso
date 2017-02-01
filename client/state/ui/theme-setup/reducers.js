/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import {
	THEME_SETUP_CLOSE_DIALOG,
	THEME_SETUP_FAILURE,
	THEME_SETUP_OPEN_DIALOG,
	THEME_SETUP_REQUEST,
	THEME_SETUP_SUCCESS,
} from 'state/action-types';

const initialState = {
	active: false,
	isDialogVisible: false,
	saveExisting: true,
};

export const themeSetup = ( state = initialState, action ) => {
	switch ( action.type ) {
		case THEME_SETUP_FAILURE:
		case THEME_SETUP_SUCCESS:
			return {
				isDialogVisible: true,
				active: false,
				saveExisting: state.saveExisting,
			};
		case THEME_SETUP_REQUEST:
			return {
				isDialogVisible: true,
				active: true,
				saveExisting: state.saveExisting,
			};
		case THEME_SETUP_OPEN_DIALOG:
			return {
				isDialogVisible: true,
				active: false,
				saveExisting: action.saveExisting,
			};
		case THEME_SETUP_CLOSE_DIALOG:
			return {
				isDialogVisible: false,
				active: false,
				saveExisting: state.saveExisting,
			};
	}

	return state;
};

export default themeSetup;

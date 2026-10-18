package tj.as.nativebuilder.notes;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class NotesSmokeTest {
    @Test
    public void addNoteIsDisplayedAndPersistedLocally() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        target.getSharedPreferences("as_native_notes", Context.MODE_PRIVATE).edit().clear().commit();

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                EditText input = activity.findViewById(R.id.note_input);
                Button add = activity.findViewById(R.id.note_add_button);
                assertNotNull("Native note input must exist", input);
                assertNotNull("Native add button must exist", add);
                input.setText("Native persistence works");
                add.performClick();

                ListView list = activity.findViewById(R.id.note_list);
                assertEquals("New note should appear in native list", 1, list.getAdapter().getCount());
                assertEquals("Native persistence works", list.getAdapter().getItem(0));
            });
        }

        String stored = target.getSharedPreferences("as_native_notes", Context.MODE_PRIVATE)
                .getString("notes_json", "[]");
        JSONArray notes = new JSONArray(stored);
        assertEquals("Note must persist in app-private storage", 1, notes.length());
        assertEquals("Native persistence works", notes.getString(0));
    }
}
